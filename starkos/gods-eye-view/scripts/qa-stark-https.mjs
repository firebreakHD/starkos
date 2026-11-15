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
const password = 'fixture-https-pass-123';
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
  tls = await startHttps({
    app: app.middlewares,
    upgradeServer: app.httpServer,
    sslDirectory: directory,
    host: '127.0.0.1',
    port: 0,
  });
  const origin = `https://127.0.0.1:${tls.address().port}`;
  process.env.STARK_HTTPS_URL = `${origin}/stark/`;
  fixture = http.createServer((req, res) => {
    if (req.url === '/api/stark/https-entry') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(httpsEntry()));
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
    if (req.url === '/embed')
      res.end(
        '<section id="httpsEntry" hidden></section><script type="module">import {setupHttpsNavigation} from "/https-navigation.js"; setupHttpsNavigation({root:document.querySelector("#httpsEntry"),base:new URL("/api/stark/",location.href)});</script>',
      );
    else
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
  await page.waitForSelector('#password');
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

  await page.type('#password', password);
  await page.click('#login button');
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
