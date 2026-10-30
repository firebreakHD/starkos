import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { DisplayStore, createDeviceToken } from './display-store.js';
import {
  MEDIA_GRANT_MS,
  PROTOCOL_VERSION,
  RECEIVER_CAPABILITIES,
  STARK_DISPLAY_PROTOCOL,
  requiredCapability,
  sanitizeCapabilities,
} from './protocol.js';
import { DISPLAY_ADAPTERS } from './adapters.js';
import { STARK_DISPLAY_TOOLS } from './tool-contract.js';
import {
  MediaSourceStore,
  SOURCE_TYPES,
  browseSource,
  readSourceFile,
} from './media-source-store.js';

const MAX_BODY = 20 * 1024 * 1024;
const claims = new Map();
const claimRequests = new Map();
const sessions = new Map();

function admitClaim(req) {
  const now = Date.now();
  for (const [id, claim] of claims)
    if (claim.expiresAt < now) claims.delete(id);
  const address = String(req.socket.remoteAddress || 'unknown');
  const recent = (claimRequests.get(address) || []).filter(
    (timestamp) => now - timestamp < 60_000,
  );
  if (recent.length >= 20 || claims.size >= 100) return false;
  recent.push(now);
  claimRequests.set(address, recent);
  return true;
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY)
        reject(
          Object.assign(new Error('Medium ist größer als 15 MB.'), {
            status: 413,
          }),
        );
      else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(
          Object.assign(new Error('Ungültige JSON-Daten.'), { status: 400 }),
        );
      }
    });
    req.on('error', reject);
  });
}

function publicDevice(device, sockets) {
  return {
    id: device.id,
    name: device.name,
    adapter: device.adapter,
    capabilities: device.capabilities,
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt,
    connected: sockets.has(device.id),
    state: device.state,
  };
}

function validateMedia(media) {
  // Eine aufgelöste Freigabe trägt statt der Daten die eigene Adresse.
  if (media && typeof media.url === 'string') {
    if (!media.url.startsWith('/api/stark/media-stream?'))
      throw Object.assign(new Error('Medienadresse ist nicht erlaubt.'), {
        status: 400,
      });
    return;
  }
  if (!media || typeof media.data !== 'string')
    throw Object.assign(new Error('Medium fehlt.'), { status: 400 });
  const embedded = /^data:(?:image\/|video\/|application\/pdf[;,])/.test(
    media.data,
  );
  const remoteMedia =
    /^(?:image|video)\//.test(String(media.type || '')) &&
    /^https:\/\//.test(media.data);
  const web = media.type === 'text/uri-list' && /^https?:\/\//.test(media.data);
  if (!embedded && !remoteMedia && !web)
    throw Object.assign(
      new Error('Nur Bilder, Videos, PDFs und HTTP(S)-Weblinks sind erlaubt.'),
      { status: 400 },
    );
}

export function createDisplayService({ store = new DisplayStore() } = {}) {
  const sockets = new Map();

  function sendCommand(targetIds, action, payload = {}) {
    const ids = [
      ...new Set(Array.isArray(targetIds) ? targetIds : [targetIds]),
    ].filter(Boolean);
    if (!ids.length)
      throw Object.assign(
        new Error('Mindestens ein Zielbildschirm ist erforderlich.'),
        { status: 400 },
      );
    if (action === 'media.show') validateMedia(payload.media);
    const required = requiredCapability(action, payload);
    const commandId = randomBytes(9).toString('base64url');
    const sessionId =
      payload.sessionId ||
      (action === 'media.show' ? randomBytes(12).toString('base64url') : null);
    const expiresAt = Date.now() + MEDIA_GRANT_MS;
    const results = ids.map((id) => {
      const device = store.get(id);
      if (!device)
        return { id, accepted: false, error: 'Display ist nicht gekoppelt.' };
      if (required && !device.capabilities.includes(required))
        return {
          id,
          accepted: false,
          error: `Display unterstützt ${required} nicht.`,
        };
      const socket = sockets.get(id);
      if (!socket || socket.readyState !== WebSocket.OPEN)
        return { id, accepted: false, error: 'Display ist offline.' };
      const command = {
        v: PROTOCOL_VERSION,
        protocol: STARK_DISPLAY_PROTOCOL,
        type: 'command',
        command: { id: commandId, sessionId, action, payload, expiresAt },
      };
      socket.send(JSON.stringify(command));
      const nextState =
        action === 'session.end'
          ? {
              status: 'standby',
              current: null,
              playback: null,
              transform: null,
            }
          : action === 'media.show'
            ? {
                status: payload.mode === 'transfer' ? 'transfer' : 'presenting',
                current: {
                  sessionId,
                  title: payload.media.title,
                  type: payload.media.type,
                  mode: payload.mode || 'show',
                  expiresAt,
                },
              }
            : { status: device.state.status };
      store.updateState(id, nextState);
      return { id, accepted: true, commandId, sessionId };
    });
    if (action === 'media.show' && results.some((result) => result.accepted))
      sessions.set(sessionId, {
        media: payload.media,
        expiresAt,
        targets: new Set(
          results
            .filter((result) => result.accepted)
            .map((result) => result.id),
        ),
      });
    return { commandId, sessionId, results };
  }

  function executeTool(tool, args = {}) {
    if (tool === 'list_displays')
      return {
        displays: store.list().map((device) => publicDevice(device, sockets)),
      };
    if (tool === 'show_media')
      return sendCommand(args.display_ids, 'media.show', {
        media: args.media,
        mode: args.mode || 'show',
      });
    if (tool === 'control_playback')
      return sendCommand(args.display_ids, `playback.${args.command}`, {
        value: args.value,
        sessionId: args.session_id,
      });
    if (tool === 'transform_image')
      return sendCommand(
        args.display_ids,
        args.reset ? 'image.reset' : 'image.transform',
        { ...args.transform, sessionId: args.session_id },
      );
    if (tool === 'end_session')
      return sendCommand(args.display_ids, 'session.end', {
        sessionId: args.session_id,
      });
    if (tool === 'move_content') {
      const source = store.get(args.source_display_id);
      const sessionId = args.session_id || source?.state?.current?.sessionId;
      const session = sessions.get(sessionId);
      if (!session || session.expiresAt < Date.now())
        throw Object.assign(new Error('Mediensitzung ist abgelaufen.'), {
          status: 410,
        });
      const shown = sendCommand(args.target_display_ids, 'media.show', {
        media: session.media,
        mode: 'show',
      });
      if (args.move !== false)
        sendCommand([args.source_display_id], 'session.end', { sessionId });
      return shown;
    }
    throw Object.assign(new Error(`Unbekanntes Werkzeug: ${tool}`), {
      status: 400,
    });
  }

  function currentMedia(id) {
    const device = store.get(id);
    const sessionId = device?.state?.current?.sessionId;
    const session = sessionId ? sessions.get(sessionId) : null;
    if (
      !device ||
      !session ||
      session.expiresAt < Date.now() ||
      !session.targets.has(id)
    )
      return null;
    return { media: session.media, sessionId, expiresAt: session.expiresAt };
  }

  return { store, sockets, sessions, sendCommand, executeTool, currentMedia };
}

/* --------------------------------------------- Sitzungsgebundene Freigaben */

// Ein Medium, das in die Receiver-Verbindung passt, reist weiterhin direkt mit
// dem Befehl. Größere Dateien bekommen stattdessen eine kurzlebige,
// sitzungsgebundene Adresse, die der Receiver selbst abruft. Er erhält dabei
// niemals die Zugangsdaten der Medienquelle und erfährt auch nicht, wo die
// Datei liegt.
export const INLINE_MEDIA_LIMIT = 14 * 1024 * 1024;

/**
 * @param {object} options
 * @param {{get: (id: string) => object|null}} options.mediaSources Quellenspeicher
 * @param {Function} [options.read] liest eine Datei der Quelle
 * @param {number} [options.limit] Grenze für das Einbetten
 * @param {number} [options.grantMs] Gültigkeit einer Freigabe
 */
export function createMediaResolver({
  mediaSources,
  read = readSourceFile,
  limit = INLINE_MEDIA_LIMIT,
  grantMs = MEDIA_GRANT_MS,
} = {}) {
  const grants = new Map();

  const sweep = (now = Date.now()) => {
    for (const [token, grant] of grants)
      if (grant.expiresAt < now) grants.delete(token);
  };

  /**
   * Löst eine Medienangabe auf. Mit `media.source` entscheidet die Größe:
   * klein genug wird die Datei eingebettet, sonst wird eine Freigabe
   * ausgestellt.
   */
  async function resolve(media) {
    if (!media?.source?.sourceId) return media;
    const { sourceId, path: relativePath } = media.source;
    const source = mediaSources.get(String(sourceId));
    if (!source)
      throw Object.assign(new Error('Medienquelle nicht gefunden.'), {
        status: 404,
      });
    try {
      const { content, type } = await read(source, relativePath, limit);
      const mime = media.type || type || 'application/octet-stream';
      return {
        title: media.title,
        type: mime,
        data: `data:${mime};base64,${content.toString('base64')}`,
      };
    } catch (error) {
      // Zu groß für die Verbindung: der Receiver holt sie sich selbst.
      if (error?.status !== 413) throw error;
    }
    sweep();
    const token = randomBytes(24).toString('base64url');
    grants.set(token, {
      sourceId: source.id,
      path: relativePath,
      type: media.type || '',
      expiresAt: Date.now() + grantMs,
    });
    return {
      title: media.title,
      type: media.type || '',
      url: `/api/stark/media-stream?token=${encodeURIComponent(token)}`,
    };
  }

  return { resolve, grants, sweep };
}

export function starkReceiverPlugin({
  service = createDisplayService(),
  mediaSources = new MediaSourceStore(),
} = {}) {
  const mediaResolver = createMediaResolver({ mediaSources });

  const install = (server) => {
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
    server.httpServer?.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', 'http://stark.local');
      if (url.pathname !== '/api/stark/ws') return;
      wss.handleUpgrade(req, socket, head, (client) =>
        wss.emit('connection', client, req),
      );
    });
    wss.on('connection', (socket) => {
      let deviceId = null;
      const timer = setTimeout(
        () => socket.close(4401, 'authentication required'),
        7000,
      );
      socket.on('message', (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return socket.close(4400, 'invalid json');
        }
        if (!deviceId) {
          if (
            message.type !== 'receiver.auth' ||
            message.protocol !== STARK_DISPLAY_PROTOCOL
          )
            return socket.close(4401, 'invalid authentication');
          const device = service.store.authenticate(
            message.deviceId,
            message.token,
          );
          if (!device) return socket.close(4403, 'access revoked');
          deviceId = device.id;
          clearTimeout(timer);
          const old = service.sockets.get(deviceId);
          if (old && old !== socket) old.close(4409, 'replaced by reconnect');
          service.sockets.set(deviceId, socket);
          service.store.updateState(deviceId, {
            status: device.state.current ? device.state.status : 'standby',
          });
          socket.send(
            JSON.stringify({
              v: PROTOCOL_VERSION,
              protocol: STARK_DISPLAY_PROTOCOL,
              type: 'receiver.ready',
              device: publicDevice(device, service.sockets),
              desiredState: device.state,
            }),
          );
          return;
        }
        if (message.type === 'state.report' || message.type === 'command.ack')
          service.store.updateState(deviceId, message.state || {});
      });
      socket.on('close', () => {
        clearTimeout(timer);
        if (deviceId && service.sockets.get(deviceId) === socket)
          service.sockets.delete(deviceId);
      });
    });

    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url || '/', 'http://stark.local');
      try {
        if (
          req.method === 'POST' &&
          url.pathname === '/api/stark/receiver/claim'
        ) {
          if (!admitClaim(req))
            return json(res, 429, {
              error: 'Zu viele Displayanfragen. Bitte kurz warten.',
            });
          const input = await readBody(req);
          const claim = {
            id: randomBytes(9).toString('base64url'),
            secret: randomBytes(24).toString('base64url'),
            suggestedName: String(input.suggestedName || 'NEUES DISPLAY').slice(
              0,
              60,
            ),
            capabilities: sanitizeCapabilities(
              input.capabilities?.length
                ? input.capabilities
                : RECEIVER_CAPABILITIES,
            ),
            expiresAt: Date.now() + 5 * 60_000,
            status: 'pending',
          };
          claims.set(claim.id, claim);
          return json(res, 202, {
            claimId: claim.id,
            claimSecret: claim.secret,
            status: claim.status,
          });
        }
        if (
          req.method === 'POST' &&
          url.pathname === '/api/stark/receiver/claim-status'
        ) {
          const input = await readBody(req);
          const claim = claims.get(String(input.claimId || ''));
          if (
            !claim ||
            claim.secret !== input.claimSecret ||
            claim.expiresAt < Date.now()
          )
            return json(res, 404, {
              error: 'Kopplungsanfrage ist abgelaufen.',
            });
          return json(
            res,
            200,
            claim.status === 'approved'
              ? { status: 'approved', device: claim.device }
              : { status: claim.status },
          );
        }
        if (
          req.method === 'GET' &&
          url.pathname === '/api/stark/pairing/pending'
        ) {
          return json(
            res,
            200,
            [...claims.values()]
              .filter(
                (claim) =>
                  claim.status === 'pending' && claim.expiresAt > Date.now(),
              )
              .map(({ id, suggestedName, capabilities, expiresAt }) => ({
                id,
                suggestedName,
                capabilities,
                expiresAt,
              })),
          );
        }
        const confirm = url.pathname.match(
          /^\/api\/stark\/pairing\/([^/]+)\/confirm$/,
        );
        if (req.method === 'POST' && confirm) {
          const input = await readBody(req);
          const claim = claims.get(confirm[1]);
          if (
            !claim ||
            claim.status !== 'pending' ||
            claim.expiresAt < Date.now()
          )
            return json(res, 404, {
              error: 'Kopplungsanfrage wurde nicht gefunden.',
            });
          const token = createDeviceToken();
          const id = randomBytes(9).toString('base64url');
          const name = String(input.name || '')
            .trim()
            .slice(0, 60);
          if (!name)
            return json(res, 400, {
              error: 'Vergib am Handy einen Namen für das Display.',
            });
          service.store.addDevice({
            id,
            name,
            token,
            capabilities: claim.capabilities,
          });
          claim.status = 'approved';
          claim.device = {
            id,
            token,
            name,
            capabilities: claim.capabilities,
            protocol: STARK_DISPLAY_PROTOCOL,
          };
          return json(res, 200, { approved: true, id, name });
        }
        if (req.method === 'GET' && url.pathname === '/api/stark/receivers')
          return json(
            res,
            200,
            service.store
              .list()
              .map((device) => publicDevice(device, service.sockets)),
          );
        const receiverPreview = url.pathname.match(
          /^\/api\/stark\/receivers\/([^/]+)\/preview$/,
        );
        if (req.method === 'GET' && receiverPreview) {
          const preview = service.currentMedia(
            decodeURIComponent(receiverPreview[1]),
          );
          return preview
            ? json(res, 200, preview)
            : json(res, 404, { error: 'Kein aktives Medium.' });
        }
        if (req.method === 'GET' && url.pathname === '/api/stark/media-sources')
          return json(res, 200, mediaSources.list());
        if (
          req.method === 'POST' &&
          url.pathname === '/api/stark/media-sources'
        ) {
          const input = await readBody(req);
          if (input.type && !SOURCE_TYPES.includes(input.type))
            return json(res, 400, {
              error: 'Dieser NAS-Adapter ist noch nicht aktiviert.',
            });
          return json(res, 201, mediaSources.add(input));
        }
        const sourceRoute = url.pathname.match(
          /^\/api\/stark\/media-sources\/([^/]+)(?:\/(test|browse|file))?$/,
        );
        if (sourceRoute) {
          const sourceId = decodeURIComponent(sourceRoute[1]);
          const operation = sourceRoute[2];
          if (req.method === 'PATCH' && !operation) {
            const updated = mediaSources.update(sourceId, await readBody(req));
            return updated
              ? json(res, 200, updated)
              : json(res, 404, { error: 'Medienquelle nicht gefunden.' });
          }
          if (req.method === 'DELETE' && !operation)
            return mediaSources.remove(sourceId)
              ? json(res, 200, { removed: true })
              : json(res, 404, { error: 'Medienquelle nicht gefunden.' });
          const source = mediaSources.get(sourceId);
          if (!source)
            return json(res, 404, { error: 'Medienquelle nicht gefunden.' });
          if (req.method === 'POST' && operation === 'test') {
            const entries = await browseSource(source, '');
            return json(res, 200, { connected: true, entries: entries.length });
          }
          if (req.method === 'GET' && operation === 'browse')
            return json(
              res,
              200,
              await browseSource(source, url.searchParams.get('path') || ''),
            );
          if (req.method === 'GET' && operation === 'file') {
            // Ein Bereich hält große Videos abspielbar, ohne die ganze Datei
            // durch das Add-on zu ziehen.
            const requested = String(req.headers.range || '').trim();
            const { content, type, status, size, contentRange } =
              await readSourceFile(
                source,
                url.searchParams.get('path') || '',
                MAX_BODY,
                requested || undefined,
              );
            res.statusCode = status === 206 ? 206 : 200;
            res.setHeader('Accept-Ranges', 'bytes');
            if (contentRange) res.setHeader('Content-Range', contentRange);
            else if (size) res.setHeader('X-Media-Size', String(size));
            res.setHeader('Content-Type', type || 'application/octet-stream');
            res.setHeader('Content-Length', String(content.length));
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return res.end(content);
          }
        }
        const revoke = url.pathname.match(/^\/api\/stark\/receivers\/([^/]+)$/);
        if (req.method === 'PATCH' && revoke) {
          const input = await readBody(req);
          const name = String(input.name || '')
            .trim()
            .slice(0, 60);
          if (!name) return json(res, 400, { error: 'Displayname fehlt.' });
          const device = service.store.rename(revoke[1], name);
          return device
            ? json(res, 200, { id: device.id, name: device.name })
            : json(res, 404, { error: 'Display nicht gefunden.' });
        }
        if (req.method === 'DELETE' && revoke) {
          const socket = service.sockets.get(revoke[1]);
          if (socket) socket.close(4403, 'access revoked');
          return service.store.revoke(revoke[1])
            ? json(res, 200, { revoked: true })
            : json(res, 404, { error: 'Display nicht gefunden.' });
        }
        // Der Receiver holt ein großes Medium selbst. Der Token gilt nur für
        // diese eine Datei und läuft mit der Mediensitzung ab.
        if (
          req.method === 'GET' &&
          url.pathname === '/api/stark/media-stream'
        ) {
          mediaResolver.sweep();
          const grant = mediaResolver.grants.get(
            url.searchParams.get('token') || '',
          );
          if (!grant || grant.expiresAt < Date.now())
            return json(res, 404, { error: 'Freigabe ist abgelaufen.' });
          const source = mediaSources.get(grant.sourceId);
          if (!source)
            return json(res, 404, { error: 'Medienquelle nicht gefunden.' });
          const requested = String(req.headers.range || '').trim();
          const { content, type, status, size, contentRange } =
            await readSourceFile(
              source,
              grant.path,
              MAX_BODY,
              requested || undefined,
            );
          res.statusCode = status === 206 ? 206 : 200;
          res.setHeader('Accept-Ranges', 'bytes');
          if (contentRange) res.setHeader('Content-Range', contentRange);
          else if (size) res.setHeader('X-Media-Size', String(size));
          res.setHeader(
            'Content-Type',
            grant.type || type || 'application/octet-stream',
          );
          res.setHeader('Content-Length', String(content.length));
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          return res.end(content);
        }
        if (req.method === 'POST' && url.pathname === '/api/stark/command') {
          const input = await readBody(req);
          const payload =
            input.action === 'media.show'
              ? {
                  ...input.payload,
                  media: await mediaResolver.resolve(input.payload?.media),
                }
              : input.payload;
          return json(
            res,
            200,
            service.sendCommand(input.displayIds, input.action, payload),
          );
        }
        if (req.method === 'GET' && url.pathname === '/api/stark/adapters')
          return json(res, 200, { adapters: DISPLAY_ADAPTERS });
        if (req.method === 'GET' && url.pathname === '/api/stark/tools')
          return json(res, 200, {
            protocol: STARK_DISPLAY_PROTOCOL,
            tools: STARK_DISPLAY_TOOLS,
          });
        if (req.method === 'POST' && url.pathname === '/api/stark/tools') {
          const input = await readBody(req);
          return json(
            res,
            200,
            service.executeTool(input.tool, input.arguments),
          );
        }
        next();
      } catch (error) {
        json(res, error.status || 500, {
          error: error.status
            ? error.message
            : 'Display-Steuerung fehlgeschlagen.',
        });
      }
    });
  };
  return {
    name: 'stark-receiver',
    configureServer: install,
    configurePreviewServer: install,
  };
}
