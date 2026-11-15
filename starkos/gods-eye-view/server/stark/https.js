import { createServer } from 'node:https';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const connections = new WeakMap();

export async function closeHttps(server) {
  if (!server) return;
  for (const socket of connections.get(server) || []) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}

export function httpsOptions({
  env = process.env,
  sslDirectory = '/ssl',
} = {}) {
  if (env.STARK_HTTPS_ENABLED !== 'true') return null;
  if (String(env.STARK_HTTPS_PASSWORD || '').trim().length < 12)
    throw new Error(
      'HTTPS benötigt ein Zugangspasswort mit mindestens 12 Zeichen.',
    );
  let root;
  try {
    root = realpathSync(sslDirectory);
  } catch {
    throw new Error(
      'Der /ssl-Ordner ist nicht verfügbar. SSL-Freigabe des Add-ons prüfen.',
    );
  }
  const load = (name, fallback) => {
    const filename = name || fallback;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,180}$/.test(filename))
      throw new Error(
        'Zertifikat und Schlüssel müssen Dateinamen im /ssl-Ordner sein.',
      );
    const target = realpathSync(path.join(root, filename));
    if (!target.startsWith(root + path.sep) || !statSync(target).isFile())
      throw new Error(
        'Zertifikat oder Schlüssel liegt außerhalb des /ssl-Ordners.',
      );
    if (statSync(target).size > 1024 * 1024)
      throw new Error('Zertifikat oder Schlüssel ist zu groß.');
    return readFileSync(target);
  };
  try {
    return {
      cert: load(env.STARK_HTTPS_CERTFILE, 'fullchain.pem'),
      key: load(env.STARK_HTTPS_KEYFILE, 'privkey.pem'),
      minVersion: 'TLSv1.2',
    };
  } catch (error) {
    if (error.code)
      throw new Error(
        'HTTPS-Zertifikat oder Schlüssel fehlt oder ist nicht lesbar. Dateien im /ssl-Ordner prüfen.',
      );
    throw error;
  }
}

// A second native TLS listener shares the authenticated app, not a forwarding
// proxy. The real socket's encrypted flag distinguishes it from HTTP Ingress.
export async function startHttps({
  app,
  upgradeServer,
  env = process.env,
  sslDirectory = '/ssl',
  port = 8443,
  host = '0.0.0.0',
} = {}) {
  const options = httpsOptions({ env, sslDirectory });
  if (!options) return null;
  let server;
  try {
    server = createServer(options, app);
  } catch {
    throw new Error(
      'HTTPS-Zertifikat und Schlüssel sind ungültig oder passen nicht zusammen.',
    );
  }
  const sockets = new Set();
  connections.set(server, sockets);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 180000;
  server.on('upgrade', (req, socket, head) => {
    if (upgradeServer?.listenerCount('upgrade'))
      upgradeServer.emit('upgrade', req, socket, head);
    else socket.destroy();
  });
  await new Promise((resolve, reject) => {
    const failed = () => {
      server.close();
      reject(new Error('HTTPS-Port konnte nicht geöffnet werden.'));
    };
    server.once('error', failed);
    server.listen(port, host, () => {
      server.off('error', failed);
      resolve();
    });
  });
  server.on('tlsClientError', () => {}); // Never log handshake material.
  return server;
}
