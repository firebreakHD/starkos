import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { httpsEntry } from './https-entry.js';

const COOKIE = 'stark_session';
const SESSION_MS = 12 * 60 * 60 * 1000;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function safeEqual(left, right) {
  const a = createHash('sha256').update(String(left)).digest();
  const b = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function requestBody(req, limit = 16_384) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit)
        reject(Object.assign(new Error('request too large'), { status: 413 }));
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function ingressRequest(req) {
  if (process.env.STARK_ADDON !== 'true') return false;
  const address = String(req.socket.remoteAddress || '').replace(
    /^::ffff:/,
    '',
  );
  return address === '172.30.32.2';
}

export function addonEntryUrl(
  rawUrl,
  addon = process.env.STARK_ADDON === 'true',
) {
  if (!addon) return rawUrl;
  const parsed = new URL(String(rawUrl || '/'), 'http://stark.local');
  const pathname = parsed.pathname;
  const query = parsed.search.slice(1);
  let target = pathname;
  if (
    (pathname === '/' || pathname === '/index.html') &&
    parsed.searchParams.get('world') === '1'
  )
    target = '/index.html';
  else if (pathname === '/world' || pathname === '/world/')
    target = '/index.html';
  return `${target}${query ? `?${query}` : ''}`;
}

export function addonEntryRedirect(
  rawUrl,
  addon = process.env.STARK_ADDON === 'true',
) {
  if (!addon) return null;
  const parsed = new URL(String(rawUrl || '/'), 'http://stark.local');
  if (
    (parsed.pathname === '/' || parsed.pathname === '/index.html') &&
    parsed.searchParams.get('world') !== '1'
  )
    return './stark/';
  return null;
}

function loadSecret(dataDir) {
  const file = path.join(dataDir, 'session-secret');
  try {
    const value = readFileSync(file);
    if (value.length >= 32) return value;
  } catch {
    /* first start */
  }
  mkdirSync(dataDir, { recursive: true });
  const value = randomBytes(48);
  writeFileSync(file, value, { mode: 0o600 });
  return value;
}

function sessionValid(req, secret) {
  const raw = String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [expires, signature] = raw.split('.');
  if (!expires || Number(expires) < Date.now()) return false;
  const expected = createHmac('sha256', secret).update(expires).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function loginPage({ setupRequired = false, homeAssistantOnly = false } = {}) {
  const message = homeAssistantOnly
    ? 'HTTPS ist bereit. Öffne STARK über Home Assistant; dessen Anmeldung wird beim Wechsel übernommen. Ein zusätzliches HTTPS-Passwort ist nicht gesetzt.'
    : setupRequired
      ? 'Öffne die Steuerung über Home Assistant. Direkter Zugriff ist nur für passive Receiver vorgesehen.'
      : 'Direkter Netzwerkzugriff erfordert dein STARK-OS-Passwort.';
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#02090c"><title>STARK OS · ACCESS</title><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(circle,#06313b,#010608 55%);color:#d9fbff;font:13px ui-monospace,monospace;letter-spacing:.08em}.card{width:min(90vw,420px);padding:34px;border:1px solid #49dff9;background:#031015;box-shadow:0 0 50px #21d5f322}.mark{font:700 24px system-ui;letter-spacing:.25em}.mark b{color:#69ebff}p{color:#9bcbd3;line-height:1.6}input,button{width:100%;height:48px;margin-top:12px;border:1px solid #42cde7;background:#061a20;color:#d9fbff;padding:0 14px;font:inherit}button{color:#69ebff;cursor:pointer}small{display:block;min-height:18px;margin-top:14px;color:#ffb35f}</style><form class="card" id="login"><div class="mark">STARK <b>OS</b></div><p>${message}</p>${setupRequired ? '' : '<input id="password" type="password" autocomplete="current-password" autofocus placeholder="ACCESS PASSWORD"><button>AUTHENTICATE</button>'}<small id="error"></small></form><script>${setupRequired ? '' : `document.querySelector('#login').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/stark/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.querySelector('#password').value})});if(r.ok)location.reload();else document.querySelector('#error').textContent=(await r.json()).error||'Zugriff verweigert';});`}</script></html>`;
}

export function starkAuthPlugin() {
  const addon = process.env.STARK_ADDON === 'true';
  const password = String(process.env.STARK_ACCESS_PASSWORD || '');
  const tlsPassword = String(process.env.STARK_HTTPS_PASSWORD || '');
  const tlsEnabled =
    process.env.STARK_HTTPS_ENABLED === 'true' &&
    (!tlsPassword || tlsPassword.trim().length >= 12);
  const passwordFor = (req) =>
    addon
      ? tlsEnabled && req.socket.encrypted === true
        ? tlsPassword
        : ''
      : password;
  const authorized = (req) =>
    ingressRequest(req) ||
    (!addon && !password) ||
    ((addon
      ? tlsEnabled && req.socket.encrypted === true
      : Boolean(password)) &&
      sessionValid(req, sessionSecret));
  const attempts = new Map();
  const tickets = new Map();
  const secret = loadSecret(
    process.env.STARK_DATA_DIR || path.resolve('.stark-data'),
  );
  const sessionSecret = addon
    ? createHmac('sha256', secret).update(tlsPassword).digest()
    : secret;
  const setSession = (req, res) => {
    const expires = String(Date.now() + SESSION_MS);
    const signature = createHmac('sha256', sessionSecret)
      .update(expires)
      .digest('base64url');
    const secure =
      req.socket.encrypted === true ||
      (ingressRequest(req) && req.headers['x-forwarded-proto'] === 'https');
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${expires}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`,
    );
  };
  const install = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url || '/', 'http://stark.local');
      if (url.pathname === '/api/stark/https-ticket' && req.method === 'POST') {
        if (
          !ingressRequest(req) ||
          !tlsEnabled ||
          process.env.STARK_HTTPS_ACTIVE !== 'true' ||
          !String(req.headers['content-type'] || '').startsWith(
            'application/json',
          ) ||
          req.headers['sec-fetch-site'] === 'cross-site'
        )
          return json(res, 403, {
            error: 'Home-Assistant-Anmeldung erforderlich.',
          });
        try {
          JSON.parse(await requestBody(req));
        } catch {
          return json(res, 400, { error: 'Ungültige Anfrage.' });
        }
        for (const [key, expires] of tickets)
          if (expires < Date.now()) tickets.delete(key);
        if (tickets.size >= 128)
          return json(res, 429, {
            error: 'Bitte kurz warten und erneut öffnen.',
          });
        const ticket = randomBytes(32).toString('base64url');
        const expiresAt = Date.now() + 60000;
        tickets.set(
          createHash('sha256').update(ticket).digest('hex'),
          expiresAt,
        );
        return json(res, 200, { ticket, expiresAt });
      }
      if (url.pathname === '/stark/https-handoff' && req.method === 'POST') {
        if (
          !tlsEnabled ||
          req.socket.encrypted !== true ||
          !String(req.headers['content-type'] || '').startsWith(
            'application/x-www-form-urlencoded',
          )
        )
          return json(res, 403, {
            error: 'Sichere HTTPS-Übergabe erforderlich.',
          });
        let form;
        try {
          form = new URLSearchParams(await requestBody(req));
        } catch {
          return json(res, 400, { error: 'Ungültige Übergabe.' });
        }
        const ticket = form.get('ticket') || '';
        const key = createHash('sha256').update(ticket).digest('hex');
        const expires = tickets.get(key);
        tickets.delete(key);
        if (
          !/^[a-zA-Z0-9_-]{43}$/.test(ticket) ||
          form.getAll('ticket').length !== 1 ||
          !expires ||
          expires < Date.now()
        )
          return json(res, 401, {
            error:
              'Übergabe abgelaufen. STARK erneut über Home Assistant öffnen.',
          });
        setSession(req, res);
        // A new TLS document initiates the following navigation so Strict
        // cookies work after the cross-site form POST. No token is put in a URL.
        const script = "location.replace(new URL('./',location.href));";
        const hash = createHash('sha256').update(script).digest('base64');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader(
          'Content-Security-Policy',
          `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`,
        );
        res.end(
          `<!doctype html><html><meta charset="utf-8"><title>STARK OS</title><style>body{background:#061218;color:#f1fafb;font:18px system-ui}</style><p>STARK wird geöffnet …</p><script>${script}</script></html>`,
        );
        return;
      }
      if (url.pathname === '/api/stark/health' && req.method === 'GET') {
        // A public, credential-free health probe is the only CORS-enabled route.
        res.setHeader('Access-Control-Allow-Origin', '*');
        return json(res, 200, {
          status: 'ok',
          service: 'starkos',
          engine: 'gods-eye-view',
          version: '0.1.2',
        });
      }
      if (
        url.pathname === '/api/stark/receiver/claim' ||
        url.pathname === '/api/stark/receiver/claim-status' ||
        // Kurzlebige, sitzungsgebundene Medienfreigabe: der Token in der
        // Anfrage ist der Ausweis, die Route prüft ihn selbst.
        url.pathname === '/api/stark/media-stream' ||
        url.pathname === '/stark/receiver.html' ||
        url.pathname === '/stark/receiver.js' ||
        url.pathname === '/stark/explanation-player.js' ||
        url.pathname === '/stark/explanation-contract.js' ||
        url.pathname === '/stark/visual-contract.js' ||
        url.pathname === '/stark/visual-canvas.js' ||
        url.pathname === '/stark/jarvis.css' ||
        url.pathname === '/stark/stark.css'
      )
        return next();
      if (url.pathname === '/api/stark/auth' && req.method === 'GET') {
        return json(res, 200, {
          authenticated: Boolean(authorized(req)),
          ingress: ingressRequest(req),
          setupRequired: addon && !passwordFor(req),
        });
      }
      if (url.pathname === '/api/stark/login' && req.method === 'POST') {
        const loginPassword = passwordFor(req);
        if (!loginPassword)
          return json(res, 503, {
            error: 'Direkter Controllerzugriff ist deaktiviert.',
          });
        if (
          !String(req.headers['content-type'] || '').startsWith(
            'application/json',
          ) ||
          req.headers['sec-fetch-site'] === 'cross-site'
        )
          return json(res, 403, {
            error: 'Nur gleichseitige JSON-Anfragen sind erlaubt.',
          });
        const now = Date.now();
        for (const [key, value] of attempts)
          if (value.until <= now) attempts.delete(key);
        const address = req.socket.remoteAddress || 'unknown';
        const attempt = attempts.get(address);
        if (attempt?.count >= 10 || (!attempt && attempts.size >= 1024))
          return json(res, 429, {
            error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.',
          });
        attempts.set(address, {
          count: (attempt?.count || 0) + 1,
          until: attempt?.until || now + 15 * 60_000,
        });
        try {
          const body = JSON.parse(await requestBody(req));
          if (!safeEqual(loginPassword, body.password))
            return json(res, 401, { error: 'Passwort ist nicht korrekt.' });
          attempts.delete(address);
          setSession(req, res);
          return json(res, 200, { authenticated: true });
        } catch (error) {
          return json(res, error.status || 400, {
            error: 'Ungültige Anmeldung.',
          });
        }
      }

      if (authorized(req)) {
        const entry = httpsEntry();
        if (
          ingressRequest(req) &&
          entry.enabled &&
          entry.requiresHandoff &&
          (url.pathname === '/' ||
            url.pathname === '/index.html' ||
            url.pathname === '/stark/' ||
            url.pathname === '/stark/index.html')
        ) {
          // Permit only the explicitly configured TLS handoff destination.
          // Preserve all other document restrictions, including script policy.
          const destination = new URL('/stark/https-handoff', entry.url).href;
          const setHeader = res.setHeader.bind(res);
          res.setHeader = (name, value) =>
            setHeader(
              name,
              String(name).toLowerCase() === 'content-security-policy'
                ? String(value).replace(
                    /form-action 'self'(?=;|$)/,
                    `form-action 'self' ${destination}`,
                  )
                : value,
            );
        }
        return next();
      }
      if (url.pathname.startsWith('/api/'))
        return json(res, 401, {
          error:
            addon && !passwordFor(req)
              ? 'Controller über Home Assistant öffnen.'
              : 'Anmeldung erforderlich.',
        });
      res.statusCode =
        addon &&
        !passwordFor(req) &&
        !(tlsEnabled && req.socket.encrypted === true)
          ? 503
          : 401;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'",
      );
      res.end(
        loginPage({
          setupRequired: addon && !passwordFor(req),
          homeAssistantOnly:
            addon &&
            tlsEnabled &&
            req.socket.encrypted === true &&
            !tlsPassword,
        }),
      );
    });
    // Home Assistant may open the proxied root even when ingress_entry is set.
    // STARK OS is the product shell, so the add-on root always enters it. God's
    // Eye remains reachable deliberately through the WORLD module at /world.
    server.middlewares.use((req, _res, next) => {
      const [pathname, query = ''] = String(req.url || '').split('?', 2);
      const redirect = addonEntryRedirect(req.url, addon);
      if (redirect) {
        _res.statusCode = 302;
        _res.setHeader('Location', redirect);
        _res.setHeader('Cache-Control', 'no-store');
        _res.end();
        return;
      }
      if (pathname === '/stark' || pathname === '/stark/')
        req.url = `/stark/index.html${query ? `?${query}` : ''}`;
      else req.url = addonEntryUrl(req.url, addon);
      next();
    });
  };
  return {
    name: 'stark-auth',
    enforce: 'pre',
    configureServer: install,
    configurePreviewServer: install,
  };
}
