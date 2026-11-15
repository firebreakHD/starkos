// Integration fixture: native HTTPS + actual preview middleware + isolated WSS receiver.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import puppeteer from 'puppeteer';
import { startHttps, closeHttps } from '../server/stark/https.js';
import { USB_DEMO } from '../public/stark/visual-demo.js';
import { httpsEntry } from '../server/stark/https-entry.js';
const directory = mkdtempSync(path.join(tmpdir(), 'stark-https-qa-'));
const password = process.env.STARK_QA_PASSWORDLESS
  ? ''
  : 'fixture-https-pass-123';
Object.assign(process.env, {
  STARK_ADDON: 'true',
  STARK_DATA_DIR: directory,
  STARK_MODEL_PROVIDER: 'gateway',
  STARK_HTTPS_ENABLED: 'true',
  STARK_HTTPS_PASSWORD: password,
  GEV_KEY_SETUP_TRUSTED_PEERS: 'none',
});
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
    path.join(directory, 'privkey.pem'),
    '-out',
    path.join(directory, 'fullchain.pem'),
  ],
  { stdio: 'ignore' },
);
const probe = http.createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const { preview } = await import('vite');
let app, tls, browser, fixture;
try {
  app = await preview({
    preview: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'error',
  });
  // Fixture-only emulation before the auth middleware, never installed by the app.
  app.middlewares.stack.unshift({
    route: '',
    handle(req, res, next) {
      if (
        ['/api/stark/https-ticket', '/stark/'].includes(req.url) &&
        req.headers['x-qa-supervisor'] === 'fixture'
      ) {
        Object.defineProperty(req.socket, 'remoteAddress', {
          value: '172.30.32.2',
          configurable: true,
        });
        res.once('finish', () => delete req.socket.remoteAddress);
      }
      next();
    },
  });
  tls = await startHttps({
    app: app.middlewares,
    upgradeServer: app.httpServer,
    sslDirectory: directory,
    host: '127.0.0.1',
    port: 0,
  });
  const origin = `https://127.0.0.1:${tls.address().port}`;
  process.env.STARK_HTTPS_URL = `${origin}/stark/`;
  const ingressHeaders = await new Promise((resolve, reject) => {
    http
      .get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/stark/',
          headers: { 'x-qa-supervisor': 'fixture' },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.headers));
        },
      )
      .on('error', reject);
  });
  const formPolicy = String(ingressHeaders['content-security-policy'])
    .split(';')
    .find((part) => part.trim().startsWith('form-action'));
  assert.ok(formPolicy, 'actual Ingress document has a form policy');
  if (!password)
    assert.ok(
      formPolicy.includes(`${origin}/stark/https-handoff`),
      'Ingress allows only the configured handoff form destination',
    );
  let entryOverride = null;
  fixture = http.createServer((req, res) => {
    if (req.url === '/api/stark/https-entry') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(entryOverride || httpsEntry()));
      return;
    }
    if (req.url === '/api/stark/https-ticket') {
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/stark/https-ticket',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-qa-supervisor': 'fixture',
          },
        },
        (response) => {
          res.writeHead(response.statusCode, {
            'content-type': 'application/json',
          });
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.statusCode = 503;
        res.end();
      });
      req.pipe(upstream);
      return;
    }
    if (req.url === '/bootstrap.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(
        'import {setupHttpsNavigation} from "/https-navigation.js"; setupHttpsNavigation({root:document.querySelector("#httpsEntry"),base:new URL("/api/stark/",location.href)});',
      );
      return;
    }
    if (req.url === '/https-navigation.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(
        readFileSync(
          new URL('../public/stark/https-navigation.js', import.meta.url),
        ),
      );
      return;
    }
    res.setHeader('content-type', 'text/html');
    if (req.url === '/embed') {
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; connect-src 'self' https:; ${formPolicy}`,
      );
      res.end(
        '<section id="httpsEntry" hidden></section><script type="module" src="/bootstrap.js"></script>',
      );
    } else
      res.end(
        `<iframe style="width:100%;height:90vh" ${req.url === '/blocked' ? 'sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"' : ''} src="/embed"></iframe>`,
      );
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  const insecure = `http://stark-insecure.test:${fixture.address().port}`;
  browser = await puppeteer.launch({
    headless: true,
    acceptInsecureCerts: true,
    executablePath: process.env.STARK_QA_CHROMIUM || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--no-proxy-server',
      '--host-resolver-rules=MAP stark-insecure.test 127.0.0.1',
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({
    width: 390,
    height: 744,
    isMobile: true,
    hasTouch: true,
  });
  await page
    .goto(`${insecure}/auto`, { waitUntil: 'domcontentloaded' })
    .catch((error) => {
      if (!String(error).includes('ERR_ABORTED')) throw error;
    });
  await page.waitForFunction(
    (origin) => location.origin === origin,
    {},
    origin,
  );
  assert.equal(
    page.frames().length,
    1,
    'automatic handoff leaves the insecure parent instead of changing only the iframe',
  );
  await page.waitForSelector(password ? '#password' : '#device');
  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  assert.equal(
    await page.evaluate(() => typeof navigator.mediaDevices?.getUserMedia),
    'function',
  );
  const blockedContext = await browser.createBrowserContext();
  const blocked = await blockedContext.newPage();
  await blocked.goto(`${insecure}/blocked`, { waitUntil: 'networkidle0' });
  assert.ok(
    blocked.url().startsWith(insecure),
    'sandbox blocks automatic top-level navigation',
  );
  const embedded = blocked
    .frames()
    .find((frame) => frame.url().endsWith('/embed'));
  await embedded.waitForSelector('#httpsEntry a[target="_top"]');
  assert.equal(await embedded.evaluate(() => isSecureContext), false);
  await embedded.click('#httpsEntry a[target="_top"]');
  await blocked.waitForFunction(
    (origin) => location.origin === origin,
    {},
    origin,
  );
  if (!password) await blocked.waitForSelector('#device');
  assert.equal(
    await blocked.evaluate(() => isSecureContext),
    true,
    'explicit user activation can switch the entire blocked view',
  );
  await blockedContext.close();
  const privateContext = await browser.createBrowserContext();
  const privatePage = await privateContext.newPage();
  await privatePage.evaluateOnNewDocument(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await privatePage.goto(`${insecure}/auto`, { waitUntil: 'networkidle0' });
  assert.ok(
    privatePage.url().startsWith(insecure),
    'restricted storage uses a manual link instead of redirect loops',
  );
  await privatePage
    .frames()
    .find((frame) => frame.url().endsWith('/embed'))
    .waitForSelector('#httpsEntry a[target="_top"]');
  await privateContext.close();
  if (!password) {
    const externalContext = await browser.createBrowserContext();
    const externalPage = await externalContext.newPage();
    await externalPage.evaluateOnNewDocument(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
    });
    await externalPage.goto(`${insecure}/auto`, { waitUntil: 'networkidle0' });
    const externalFrame = externalPage
      .frames()
      .find((frame) => frame.url().endsWith('/embed'));
    await externalFrame.waitForSelector('#httpsEntry a[target="_blank"]');
    const popupPromise = new Promise((resolve) =>
      externalPage.once('popup', resolve),
    );
    await externalFrame.click('#httpsEntry a[target="_blank"]');
    const popup = await popupPromise;
    await popup.waitForSelector('#device');
    assert.ok(
      popup.url().startsWith(origin),
      'external browser fallback also authenticates without a password',
    );
    assert.equal(await popup.evaluate(() => opener), null);
    await externalContext.close();
  }

  // A target that cannot be verified must never replace the working parent.
  const failureContext = await browser.createBrowserContext();
  const failure = await failureContext.newPage();
  await failure.setRequestInterception(true);
  failure.on('request', (request) => {
    if (
      request.url().startsWith(origin) &&
      request.url().includes('/api/stark/health')
    )
      request.abort('connectionrefused');
    else request.continue();
  });
  await failure.goto(`${insecure}/auto`, { waitUntil: 'networkidle0' });
  const failureFrame = failure
    .frames()
    .find((frame) => frame.url().endsWith('/embed'));
  await failureFrame.waitForFunction(() =>
    document
      .querySelector('#httpsEntry')
      .textContent.includes('nicht bestätigt'),
  );
  assert.ok(
    failure.url().startsWith(insecure),
    'unreachable target keeps the original parent open',
  );
  assert.equal(
    await failureFrame.evaluate(() =>
      sessionStorage.getItem('stark-https-handoff-v2'),
    ),
    null,
    'failed probe does not consume the next valid attempt',
  );
  await failureContext.close();
  entryOverride = {
    enabled: true,
    url: `https://127.0.0.1:${tls.address().port}/wrong/stark/`,
    autoOpen: true,
  };
  const wrongContext = await browser.createBrowserContext();
  const wrong = await wrongContext.newPage();
  await wrong.setRequestInterception(true);
  wrong.on('request', (request) => {
    if (request.url().includes('/wrong/api/stark/health'))
      request.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ message: 'Home Assistant' }),
      });
    else request.continue();
  });
  await wrong.goto(`${insecure}/auto`, { waitUntil: 'networkidle0' });
  await wrong
    .frames()
    .find((frame) => frame.url().endsWith('/embed'))
    .waitForFunction(() =>
      document
        .querySelector('#httpsEntry')
        .textContent.includes('nicht als STARK'),
    );
  assert.ok(
    wrong.url().startsWith(insecure),
    'another service never causes automatic navigation',
  );
  await wrongContext.close();
  entryOverride = null;
  if (password) {
    await page.type('#password', password);
    await page.click('#login button');
  }
  await page.waitForSelector('#device');
  const cookie = (await page.cookies()).find((c) => c.name === 'stark_session');
  assert.ok(cookie.secure && cookie.httpOnly);
  const api = async (endpoint, body) =>
    page.evaluate(
      async (endpoint, body) => {
        const r = await fetch(
          `/api/stark/${endpoint}`,
          body
            ? {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              }
            : {},
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      endpoint,
      body,
    );
  assert.equal((await api('auth')).authenticated, true);
  assert.equal((await api('https-entry')).url, `${origin}/stark/`);
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/stark/jarvis/status`, {
        headers: {
          cookie: `stark_session=${cookie.value}`,
          'x-forwarded-proto': 'https',
        },
      })
    ).status,
    401,
  );
  const claim = await api('receiver/claim', {
    suggestedName: 'TLS QA',
    capabilities: ['media.image'],
  });
  await api(`pairing/${claim.claimId}/confirm`, { name: 'TLS QA' });
  const approved = await api('receiver/claim-status', claim);
  const receiverContext = await browser.createBrowserContext();
  const receiver = await receiverContext.newPage();
  receiver.on('pageerror', (e) => errors.push(e.message));
  await receiver.evaluateOnNewDocument(
    (device) =>
      localStorage.setItem('stark-receiver-device', JSON.stringify(device)),
    approved.device,
  );
  await receiver.goto(`${origin}/stark/receiver.html`, {
    waitUntil: 'networkidle0',
  });
  await receiver.waitForFunction(
    () =>
      document.querySelector('#receiverState').textContent === 'SECURE LINK',
  );
  const presented = await api('tools', {
    tool: 'present_explanation',
    arguments: { display_ids: [approved.device.id], explanation: USB_DEMO },
  });
  assert.equal(presented.results[0].accepted, true);
  await receiver.waitForSelector('.ink-model');
  assert.equal(
    (await receiver.cookies()).some((c) => c.name === 'stark_session'),
    false,
    'passive WSS receiver works without controller cookie',
  );
  if (process.env.STARK_QA_OUTPUT) {
    mkdirSync(process.env.STARK_QA_OUTPUT, { recursive: true });
    await page.screenshot({
      path: path.join(
        process.env.STARK_QA_OUTPUT,
        'stark-https-controller.png',
      ),
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: actual preview HTTPS login, Secure/HttpOnly cookie, secure browser context/media API, HTTP denial and isolated receiver over real WSS. Test certificate is trusted only by the test browser; no physical microphone or live provider account is used.',
  );
} finally {
  await browser?.close();
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
  await closeHttps(tls);
  if (app) await new Promise((resolve) => app.httpServer.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
