import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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

function loginPage({ setupRequired = false } = {}) {
  const message = setupRequired
    ? 'Setze zuerst access_password in der Home-Assistant-Konfiguration.'
    : 'Direkter Netzwerkzugriff erfordert dein STARK-OS-Passwort.';
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#02090c"><title>STARK OS · ACCESS</title><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(circle,#06313b,#010608 55%);color:#d9fbff;font:13px ui-monospace,monospace;letter-spacing:.08em}.card{width:min(90vw,420px);padding:34px;border:1px solid #49dff9;background:#031015;box-shadow:0 0 50px #21d5f322}.mark{font:700 24px system-ui;letter-spacing:.25em}.mark b{color:#69ebff}p{color:#9bcbd3;line-height:1.6}input,button{width:100%;height:48px;margin-top:12px;border:1px solid #42cde7;background:#061a20;color:#d9fbff;padding:0 14px;font:inherit}button{color:#69ebff;cursor:pointer}small{display:block;min-height:18px;margin-top:14px;color:#ffb35f}</style><form class="card" id="login"><div class="mark">STARK <b>OS</b></div><p>${message}</p>${setupRequired ? '' : '<input id="password" type="password" autocomplete="current-password" autofocus placeholder="ACCESS PASSWORD"><button>AUTHENTICATE</button>'}<small id="error"></small></form><script>${setupRequired ? '' : `document.querySelector('#login').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/stark/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.querySelector('#password').value})});if(r.ok)location.reload();else document.querySelector('#error').textContent=(await r.json()).error||'Zugriff verweigert';});`}</script></html>`;
}

export function starkAuthPlugin() {
  const addon = process.env.STARK_ADDON === 'true';
  const password = String(process.env.STARK_ACCESS_PASSWORD || '');
  const secret = loadSecret(
    process.env.STARK_DATA_DIR || path.resolve('.stark-data'),
  );
  const install = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url || '/', 'http://stark.local');
      if (url.pathname === '/api/stark/health')
        return json(res, 200, {
          status: 'ok',
          engine: 'gods-eye-view',
          version: '0.1.0',
        });
      if (
        url.pathname === '/api/stark/receiver/claim' ||
        url.pathname === '/api/stark/receiver/claim-status' ||
        url.pathname === '/stark/receiver.html' ||
        url.pathname === '/stark/receiver.js' ||
        url.pathname === '/stark/stark.css'
      )
        return next();
      if (url.pathname === '/api/stark/auth' && req.method === 'GET') {
        return json(res, 200, {
          authenticated:
            ingressRequest(req) ||
            (!addon && !password) ||
            sessionValid(req, secret),
          ingress: ingressRequest(req),
          setupRequired: addon && !password,
        });
      }
      if (url.pathname === '/api/stark/login' && req.method === 'POST') {
        if (!password)
          return json(res, 503, {
            error: 'access_password ist nicht konfiguriert.',
          });
        try {
          const body = JSON.parse(await requestBody(req));
          if (!safeEqual(password, body.password))
            return json(res, 401, { error: 'Passwort ist nicht korrekt.' });
          const expires = String(Date.now() + SESSION_MS);
          const signature = createHmac('sha256', secret)
            .update(expires)
            .digest('base64url');
          const secure = req.headers['x-forwarded-proto'] === 'https';
          res.setHeader(
            'Set-Cookie',
            `${COOKIE}=${expires}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`,
          );
          return json(res, 200, { authenticated: true });
        } catch (error) {
          return json(res, error.status || 400, {
            error: 'Ungültige Anmeldung.',
          });
        }
      }

      if (
        ingressRequest(req) ||
        (!addon && !password) ||
        sessionValid(req, secret)
      )
        return next();
      if (url.pathname.startsWith('/api/'))
        return json(res, 401, {
          error:
            addon && !password
              ? 'access_password ist nicht konfiguriert.'
              : 'Anmeldung erforderlich.',
        });
      res.statusCode = addon && !password ? 503 : 401;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'",
      );
      res.end(loginPage({ setupRequired: addon && !password }));
    });
    // Vite's history fallback otherwise serves the God's Eye root document for
    // the directory URL before its public-file middleware reaches index.html.
    server.middlewares.use((req, _res, next) => {
      const [pathname, query = ''] = String(req.url || '').split('?', 2);
      if (pathname === '/stark' || pathname === '/stark/')
        req.url = `/stark/index.html${query ? `?${query}` : ''}`;
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
