import test from 'node:test';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { WebSocketServer, WebSocket } from 'ws';
import { startHttps, closeHttps, httpsOptions } from './https.js';
import { starkAuthPlugin } from './auth.js';

const directory = mkdtempSync(path.join(tmpdir(), 'stark-tls-'));
const certfile = path.join(directory, 'fullchain.pem'),
  keyfile = path.join(directory, 'privkey.pem');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout',
    keyfile,
    '-out',
    certfile,
  ],
  { stdio: 'ignore' },
);
const env = {
  STARK_HTTPS_ENABLED: 'true',
  STARK_HTTPS_PASSWORD: 'fixture-password-123',
};
const ca = readFileSync(certfile);
const request = (
  server,
  route,
  { tls = true, method = 'GET', body, headers = {} } = {},
) =>
  new Promise((resolve, reject) => {
    const client = (tls ? https : http).request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: route,
        method,
        ca,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, text }),
        );
      },
    );
    client.on('error', reject);
    client.end(
      typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
    );
  });
test.after(() => rmSync(directory, { recursive: true, force: true }));

test('HTTPS is off by default and refuses weak credentials, unsafe paths, external symlinks and malformed certificates', async () => {
  assert.equal(
    httpsOptions({ env: {}, sslDirectory: '/does-not-exist' }),
    null,
  );
  assert.throws(
    () =>
      httpsOptions({
        env: { ...env, STARK_HTTPS_PASSWORD: 'short' },
        sslDirectory: directory,
      }),
    /mindestens 12/,
  );
  assert.throws(
    () =>
      httpsOptions({
        env: { ...env, STARK_HTTPS_CERTFILE: '../outside.pem' },
        sslDirectory: directory,
      }),
    /Dateinamen/,
  );
  symlinkSync('/etc/hosts', path.join(directory, 'outside.pem'));
  assert.throws(
    () =>
      httpsOptions({
        env: { ...env, STARK_HTTPS_CERTFILE: 'outside.pem' },
        sslDirectory: directory,
      }),
    /außerhalb/,
  );
  assert.throws(
    () =>
      httpsOptions({
        env: { ...env, STARK_HTTPS_KEYFILE: 'missing.pem' },
        sslDirectory: directory,
      }),
    /nicht lesbar/,
  );
  writeFileSync(
    path.join(directory, 'invalid.pem'),
    'not a certificate or key',
  );
  await assert.rejects(
    () =>
      startHttps({
        env: { ...env, STARK_HTTPS_KEYFILE: 'invalid.pem' },
        sslDirectory: directory,
        app: (_req, res) => res.end(),
        port: 0,
        host: '127.0.0.1',
      }),
    /ungültig/,
  );
});

test('real TLS login admits controllers, secure cookies cannot admit HTTP, Ingress/public receiver boundaries remain intact and WSS works', async () => {
  const previous = { ...process.env };
  let plain, secure, wsServer;
  try {
    Object.assign(process.env, env, {
      STARK_ADDON: 'true',
      STARK_DATA_DIR: directory,
      STARK_ACCESS_PASSWORD: '',
    });
    const middleware = [];
    starkAuthPlugin().configureServer({
      middlewares: { use: (fn) => middleware.push(fn) },
    });
    const app = (req, res) => {
      middleware[0](req, res, () => {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({ ok: true, tls: req.socket.encrypted === true }),
        );
      }).catch(() => {
        res.statusCode = 500;
        res.end();
      });
    };
    plain = http.createServer(app);
    wsServer = new WebSocketServer({ noServer: true });
    wsServer.on('connection', (socket) =>
      socket.on('message', (message) => socket.send(message)),
    );
    plain.on('upgrade', (req, socket, head) => {
      assert.equal(req.socket.encrypted, true);
      wsServer.handleUpgrade(req, socket, head, (client) =>
        wsServer.emit('connection', client, req),
      );
    });
    await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve));
    secure = await startHttps({
      app,
      upgradeServer: plain,
      env,
      sslDirectory: directory,
      port: 0,
      host: '127.0.0.1',
    });
    assert.equal(
      (await request(secure, '/api/stark/jarvis/status')).status,
      401,
    );
    const health = await request(secure, '/api/stark/health', {
      headers: { origin: 'http://phone.example' },
    });
    assert.equal(health.headers['access-control-allow-origin'], '*');
    assert.equal(JSON.parse(health.text).service, 'starkos');
    const protectedRoute = await request(secure, '/api/stark/jarvis/status', {
      headers: { origin: 'http://phone.example' },
    });
    assert.equal(
      protectedRoute.headers['access-control-allow-origin'],
      undefined,
    );
    assert.equal(protectedRoute.status, 401);

    assert.equal(
      (
        await request(plain, '/api/stark/login', {
          tls: false,
          method: 'POST',
          body: { password: env.STARK_HTTPS_PASSWORD },
          headers: { 'x-forwarded-proto': 'https' },
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await request(secure, '/api/stark/login', {
          method: 'POST',
          body: { password: env.STARK_HTTPS_PASSWORD },
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ).status,
      403,
    );
    const login = await request(secure, '/api/stark/login', {
      method: 'POST',
      body: { password: env.STARK_HTTPS_PASSWORD },
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers['set-cookie'][0];
    assert.match(setCookie, /; Secure/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    assert.equal(
      (
        await request(secure, '/api/stark/jarvis/status', {
          headers: { cookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(plain, '/api/stark/jarvis/status', {
          tls: false,
          headers: {
            cookie,
            'x-forwarded-proto': 'https',
            'x-forwarded-for': '172.30.32.2',
          },
        })
      ).status,
      401,
    );
    for (const file of [
      'receiver.js',
      'visual-contract.js',
      'visual-canvas.js',
    ])
      assert.equal(
        (await request(plain, `/stark/${file}`, { tls: false })).status,
        200,
      );
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await request(secure, '/api/stark/login', {
            method: 'POST',
            body: { password: 'wrong' },
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await request(secure, '/api/stark/login', {
          method: 'POST',
          body: { password: 'wrong' },
        })
      ).status,
      429,
    );
    const socket = new WebSocket(
      `wss://127.0.0.1:${secure.address().port}/echo`,
      { ca },
    );
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const echoed = new Promise((resolve) =>
      socket.once('message', (value) => resolve(value.toString())),
    );
    socket.send('native TLS websocket');
    assert.equal(await echoed, 'native TLS websocket');
    // Shutdown must also terminate upgraded connections, not hang on them.
    await closeHttps(secure);
    secure = null;
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await request(plain, '/api/stark/jarvis/status', { tls: false }))
          .status,
        401,
      );
  } finally {
    wsServer?.clients.forEach((socket) => socket.terminate());
    wsServer?.close();
    await closeHttps(secure);
    plain?.closeAllConnections();
    if (plain) await new Promise((resolve) => plain.close(resolve));
    for (const key of [
      'STARK_ADDON',
      'STARK_DATA_DIR',
      'STARK_ACCESS_PASSWORD',
      ...Object.keys(env),
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('app entry uses only explicit credential-free HTTPS URLs and only an active listener', async () => {
  const { normalizeHttpsEntry, httpsEntry } = await import('./https-entry.js');
  assert.equal(
    normalizeHttpsEntry('https://stark.example:8789'),
    'https://stark.example:8789/stark/',
  );
  for (const value of [
    '',
    null,
    'http://stark.example',
    'javascript:alert(1)',
    'https://user:secret@stark.example/',
    'https://stark.example/?code=secret',
    'https://stark.example/#token',
    'https://' + 'x'.repeat(2050),
  ])
    assert.equal(normalizeHttpsEntry(value), null);
  const enabled = {
    STARK_HTTPS_ENABLED: 'true',
    STARK_HTTPS_ACTIVE: 'true',
    STARK_HTTPS_URL: 'https://stark.example:8789/stark/',
    STARK_HTTPS_PASSWORD: 'never returned',
  };
  assert.deepEqual(httpsEntry(enabled), {
    enabled: true,
    url: enabled.STARK_HTTPS_URL,
    autoOpen: true,
    requiresHandoff: false,
  });
  assert.equal(
    httpsEntry({ ...enabled, STARK_HTTPS_AUTO_OPEN: 'false' }).autoOpen,
    false,
  );
  for (const field of ['STARK_HTTPS_ENABLED', 'STARK_HTTPS_ACTIVE'])
    assert.deepEqual(httpsEntry({ ...enabled, [field]: 'false' }), {
      enabled: false,
      url: null,
      autoOpen: false,
      requiresHandoff: false,
    });
  assert.doesNotMatch(JSON.stringify(httpsEntry(enabled)), /never returned/);
});

test('device HTTPS preflight refuses unreachable, wrong-service and unsafe targets without credentials or redirects', async () => {
  const { checkHttpsTarget } =
    await import('../../public/stark/https-navigation.js');
  let call;
  const ok = await checkHttpsTarget('https://stark.example:8789/stark/', {
    fetchImpl: async (url, options) => {
      call = { url: String(url), options };
      return Response.json({ status: 'ok', service: 'starkos' });
    },
  });
  assert.equal(ok.reachable, true);
  assert.equal(call.url, 'https://stark.example:8789/api/stark/health');
  assert.equal(call.options.credentials, 'omit');
  assert.equal(call.options.redirect, 'error');
  assert.equal(
    (
      await checkHttpsTarget('https://stark.example/', {
        fetchImpl: async () => Response.json({ message: 'Home Assistant' }),
      })
    ).reachable,
    false,
  );
  assert.equal(
    (
      await checkHttpsTarget('https://stark.example/', {
        fetchImpl: async () => {
          throw new Error('offline');
        },
      })
    ).reachable,
    false,
  );
  assert.equal(
    (
      await checkHttpsTarget('https://stark.example/', {
        fetchImpl: async () => new Response('', { status: 503 }),
      })
    ).reachable,
    false,
  );
  assert.equal(
    (
      await checkHttpsTarget('http://stark.example/', {
        fetchImpl: () => assert.fail('no HTTP probe'),
      })
    ).reachable,
    false,
  );
});

test('empty HTTPS password starts TLS and accepts only a one-use POST handoff from authenticated Ingress', async () => {
  const previous = { ...process.env };
  let secure, plain;
  try {
    Object.assign(process.env, {
      STARK_ADDON: 'true',
      STARK_DATA_DIR: directory,
      STARK_HTTPS_ENABLED: 'true',
      STARK_HTTPS_PASSWORD: '',
    });
    const stack = [];
    starkAuthPlugin().configureServer({
      middlewares: { use: (fn) => stack.push(fn) },
    });
    const app = (req, res) =>
      stack[0](req, res, () => {
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
      });
    plain = http.createServer(app);
    await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve));
    secure = await startHttps({
      app,
      sslDirectory: directory,
      port: 0,
      host: '127.0.0.1',
    });
    assert.ok(secure);
    assert.equal(
      (await request(secure, '/api/stark/jarvis/status')).status,
      401,
    );
    assert.equal(
      (
        await request(secure, '/api/stark/https-ticket', {
          method: 'POST',
          body: {},
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(plain, '/api/stark/https-ticket', {
          tls: false,
          method: 'POST',
          body: {},
        })
      ).status,
      403,
    );
    const issue = async (headers = {}) => {
      const req = Readable.from([Buffer.from('{}')]);
      Object.assign(req, {
        url: '/api/stark/https-ticket',
        method: 'POST',
        socket: { remoteAddress: '172.30.32.2' },
        headers: { 'content-type': 'application/json', ...headers },
      });
      let payload;
      const res = {
        setHeader() {},
        end(body) {
          payload = JSON.parse(body);
        },
      };
      await stack[0](req, res, () => assert.fail('mint must be handled'));
      return { status: res.statusCode, ...payload };
    };
    assert.equal((await issue({ 'sec-fetch-site': 'cross-site' })).status, 403);
    const expired = await issue();
    const now = Date.now;
    try {
      Date.now = () => expired.expiresAt + 1;
      const rejected = await request(secure, '/stark/https-handoff', {
        method: 'POST',
        body: new URLSearchParams({ ticket: expired.ticket }).toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      assert.equal(rejected.status, 401, 'expired handoff is rejected');
    } finally {
      Date.now = now;
    }
    const minted = await issue();
    assert.equal(minted.status, 200);
    const body = new URLSearchParams({ ticket: minted.ticket }).toString();
    assert.equal(
      (
        await request(plain, '/stark/https-handoff', {
          tls: false,
          method: 'POST',
          body,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        })
      ).status,
      403,
    );
    const accepted = await request(secure, '/stark/https-handoff', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'sec-fetch-site': 'cross-site',
      },
    });
    assert.equal(accepted.status, 200);
    assert.ok(!accepted.text.includes(minted.ticket));
    const setCookie = accepted.headers['set-cookie'][0];
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    assert.equal(
      (
        await request(secure, '/api/stark/jarvis/status', {
          headers: { cookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(plain, '/api/stark/jarvis/status', {
          tls: false,
          headers: { cookie },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(secure, '/stark/https-handoff', {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        })
      ).status,
      401,
    );
  } finally {
    await closeHttps(secure);
    plain?.closeAllConnections();
    if (plain) await new Promise((resolve) => plain.close(resolve));
    for (const key of [
      'STARK_ADDON',
      'STARK_DATA_DIR',
      'STARK_HTTPS_ENABLED',
      'STARK_HTTPS_PASSWORD',
      'STARK_HTTPS_ACTIVE',
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
