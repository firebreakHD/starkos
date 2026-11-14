// Deterministic browser QA: a local protocol fixture, never a live/second agent.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { CONVERSATION_DEMO } from '../public/stark/conversation-demo.js';

async function openRingModule(page, title) {
  await page.waitForFunction(
    () =>
      !document.querySelector('#device').hidden &&
      document.querySelector('#panel').getBoundingClientRect().top >=
        innerHeight,
  );
  const entries = await page.$$('.ring-item');
  let found = false;
  for (const entry of entries) {
    if (
      await entry.$eval(
        'strong',
        (node, title) => node.textContent === title,
        title,
      )
    ) {
      await entry.focus();
      await entry.click();
      found = true;
      break;
    }
  }
  assert.ok(found, `Menu entry exists: ${title}`);
  await page.waitForFunction(
    (title) => document.querySelector('#coreTitle').textContent === title,
    { timeout: 5000 },
    title,
  );
  await page.click('#core');
  if (
    (await page.$eval('#device', (node) => !node.hidden)) &&
    !(await page.$eval('#panel', (node) => node.classList.contains('open')))
  )
    await page.click('#core');
}

const temporary = await mkdtemp(path.join(tmpdir(), 'stark-qa-'));
const calls = [];
const mock = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  calls.push(body);
  const last = body.messages.at(-1);
  const message =
    last.role === 'tool'
      ? {
          role: 'assistant',
          content: 'Die lokale Testdarstellung ist geöffnet.',
        }
      : {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'qa-visual',
              type: 'function',
              function: {
                name: 'present_explanation',
                arguments: JSON.stringify({
                  display_ids: [],
                  explanation: CONVERSATION_DEMO,
                }),
              },
            },
          ],
        };
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message }] }));
});
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
process.env.STARK_HERMES_URL = `http://127.0.0.1:${mock.address().port}/v1/chat/completions`;
process.env.STARK_HERMES_MODEL = 'qa-protocol-fixture';
process.env.STARK_MODEL_PROVIDER = 'gateway';
process.env.STARK_DATA_DIR = temporary;
process.env.STARK_ADDON = 'false';
process.env.STARK_ACCESS_PASSWORD = '';
process.env.GEV_KEY_SETUP_TRUSTED_PEERS = 'none';
const { createServer } = await import('vite');
let server, browser;
try {
  server = await createServer({
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.STARK_QA_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  let statusRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/stark/jarvis/status')
      statusRequests++;
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    // No microphone audio or OS voice service is used by this test.
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak(u) {
          (window.__spokenTexts ??= []).push(u.text);
          setTimeout(() => u.onend?.(), 0);
        },
        cancel() {},
      },
    });
    window.SpeechRecognition = class {
      start() {
        this.onstart?.();
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [
              Object.assign([{ transcript: 'Demo' }], { isFinal: true }),
            ],
          });
          this.onend?.();
        }, 10);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    };
  });
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`${origin}/stark/`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#device', (el) => el.hidden), false);
  assert.equal(await page.$eval('#jarvisHome', (el) => el.hidden), true);
  assert.equal(await page.$$eval('.ring-item', (entries) => entries.length), 6);
  assert.equal(
    statusRequests,
    0,
    'menu startup must not start the Assistant connection',
  );
  if (process.env.STARK_QA_OUTPUT) {
    await mkdir(process.env.STARK_QA_OUTPUT, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.STARK_QA_OUTPUT, 'stark-menu.png'),
      fullPage: true,
    });
  }
  await openRingModule(page, 'INVESTIGATION');
  await page.waitForSelector('.panel.open .investigation-module');
  assert.equal(
    await page.$$eval('.evidence-node', (entries) => entries.length),
    4,
    'original Investigation case board remains reachable',
  );
  await page.click('#closePanel');
  await openRingModule(page, 'ASSISTANT');
  await page.waitForFunction(() =>
    document.querySelector('[data-status]').textContent.startsWith('Bereit.'),
  );
  assert.equal(await page.$eval('#device', (el) => el.hidden), true);
  assert.equal(await page.$eval('[data-chat]', (el) => el.open), false);
  assert.equal(await page.$('[data-text-options]'), null);
  const openChatByDrag = async () => {
    const box = await page.$eval('[data-chat-grip]', (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(
      await page.$eval('[data-chat-grip]', (el) =>
        el.classList.contains('is-ready'),
      ),
      true,
    );
    assert.ok(
      (await page.$eval(
        '[data-chat-grip]',
        (el) => el.getBoundingClientRect().width,
      )) > box.width,
    );
    await page.mouse.move(box.x + 140, box.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForSelector('[data-chat][open]');
  };
  await page.click('[data-chat-grip]');
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    false,
    'short tap must not open text mode',
  );
  const early = await page.$eval('[data-chat-grip]', (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(early.x, early.y);
  await page.mouse.down();
  await page.mouse.move(early.x + 140, early.y, { steps: 3 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    false,
    'dragging before the hold threshold must cancel',
  );
  assert.equal(
    await page.$eval('[data-chat-grip]', (el) =>
      el.classList.contains('is-ready'),
    ),
    false,
  );
  await openChatByDrag();
  await page.type('[data-input]', 'bleib hier');
  await page.click('[data-text-form] button[type="submit"]');
  assert.match(
    await page.$eval('[data-chat-log]', (el) => el.textContent),
    /bleib hier/,
  );
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    true,
    'sending text keeps the text conversation open',
  );
  await page.click('[data-chat-close]');
  assert.equal(await page.$eval('[data-chat]', (el) => el.open), false);
  const cancelPoint = await page.$eval('[data-chat-grip]', (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(cancelPoint.x, cancelPoint.y);
  await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, 550));
  await page.$eval('[data-chat-grip]', (el) =>
    el.dispatchEvent(
      new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }),
    ),
  );
  await page.mouse.up();
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    false,
    'cancelled pointer gesture stays in voice',
  );
  assert.equal(
    await page.$eval('[data-chat-grip]', (el) =>
      el.classList.contains('is-ready'),
    ),
    false,
  );
  await page.focus('[data-chat-grip]');
  await page.keyboard.press('Enter');
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    true,
    'keyboard activation is accessible',
  );
  await page.keyboard.press('Escape');
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    false,
    'Escape returns to voice',
  );
  await page.click('[data-mic]');
  await page.waitForSelector('.explain-window');
  assert.equal(await page.$$eval('.explain-window', (els) => els.length), 1);
  assert.match(
    await page.$eval('[data-status]', (el) => el.textContent),
    /Demo/,
  );
  assert.equal(calls.length, 0, 'offline demo must never call Hermes');
  const send = async (text) => {
    await page.evaluate((text) => {
      const input = document.querySelector('[data-input]');
      input.value = text;
      document.querySelector('[data-text-form]').requestSubmit();
    }, text);
  };
  await send('bleib hier');
  assert.match(
    await page.$eval('.explain-header', (el) => el.textContent),
    /angehalten/,
  );
  await send('weiter');
  assert.match(
    await page.$eval('.explain-header', (el) => el.textContent),
    /Fenster 2\/2/,
  );
  for (const size of [
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
    { width: 320, height: 740 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewport({ ...size, isMobile: true, hasTouch: true });
    await page.waitForFunction(() => document.querySelector('.explain-header'));
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('#jarvisHome').scrollWidth >
          document.querySelector('#jarvisHome').clientWidth,
      ),
      false,
      `horizontal overflow ${size.width}`,
    );
  }
  assert.match(
    await page.$eval('.explain-header', (el) => el.textContent),
    /Fenster 2\/2/,
    'rotation must keep selected window',
  );
  await send('ohne Fenster');
  assert.equal(await page.$eval('[data-explanation]', (el) => el.hidden), true);
  await send('mit Fenstern');
  await openChatByDrag();
  const spokenBeforeChat = await page.evaluate(
    () => window.__spokenTexts?.length || 0,
  );
  await send('Untersuche das Beispiel');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-answer]')
      .textContent.includes('Testdarstellung'),
  );
  assert.equal(calls.length, 2, 'one real server-side tool loop');
  assert.ok(
    calls[0].tools.some((t) => t.function.name === 'present_explanation'),
  );
  assert.equal(calls[1].messages.at(-1).role, 'tool');
  assert.match(
    await page.$eval('[data-chat-log]', (el) => el.textContent),
    /Testdarstellung/,
  );
  assert.equal(
    await page.evaluate(() => window.__spokenTexts?.length || 0),
    spokenBeforeChat,
    'text mode must not speak replies',
  );
  assert.equal(
    await page.$eval(
      '[data-chat-visual] [data-explanation]',
      (el) => el.hidden,
    ),
    false,
    'visuals stay usable in text chat',
  );
  await send('bleib hier');
  const output =
    process.env.STARK_QA_OUTPUT || path.join(temporary, 'screenshots');
  await mkdir(output, { recursive: true });
  await page.screenshot({
    path: path.join(output, 'stark-chat-phone.png'),
    fullPage: true,
  });
  for (const size of [
    { width: 320, height: 740 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewport({ ...size, isMobile: true, hasTouch: true });
    assert.equal(
      await page.$eval('[data-chat]', (el) => el.open),
      true,
      'rotation keeps the current text view',
    );
    assert.equal(
      await page.$eval('[data-chat]', (el) => el.scrollWidth > el.clientWidth),
      false,
      'text view must fit small/landscape screens',
    );
  }
  await page.click('[data-chat-close]');
  await page.screenshot({
    path: path.join(output, 'stark-phone.png'),
    fullPage: true,
  });
  await page.setViewport({
    width: 1440,
    height: 1000,
    isMobile: true,
    hasTouch: true,
  });
  await page.screenshot({
    path: path.join(output, 'stark-desktop.png'),
    fullPage: true,
  });
  await openChatByDrag();
  await send('Öffne Medien');
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    false,
    'opening another module leaves text mode',
  );
  await page.waitForSelector('.panel.open .stark-browser');
  await page.click('#browserBack');
  await page.click('#browseModules');
  assert.equal(await page.$eval('#device', (el) => el.hidden), false);
  await openRingModule(page, 'ASSISTANT');
  assert.equal(await page.$eval('#jarvisHome', (el) => el.hidden), false);
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    false,
    'reopening Assistant always starts in voice view',
  );
  assert.match(
    await page.$eval('[data-chat-log]', (el) => el.textContent),
    /Testdarstellung/,
    'history is preserved across the voice/text view change',
  );
  assert.equal(
    statusRequests,
    1,
    'reopening Assistant reuses its conversation',
  );
  // Real paired receiver + authenticated WebSocket command/ack path.
  const post = async (endpoint, body) => {
    const response = await fetch(`${origin}/api/stark/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.ok(response.ok);
    return response.json();
  };
  const claim = await post('receiver/claim', {
    suggestedName: 'QA display',
    capabilities: ['media.image'],
  });
  await post(`pairing/${claim.claimId}/confirm`, { name: 'QA display' });
  const approved = await post('receiver/claim-status', claim);
  const receiver = await browser.newPage();
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
  const devices = await (await fetch(`${origin}/api/stark/receivers`)).json();
  assert.ok(
    devices[0].capabilities.includes('explanation.scenes'),
    'authenticated reconnect refreshes capabilities',
  );
  const presented = await post('tools', {
    tool: 'present_explanation',
    arguments: {
      display_ids: [approved.device.id],
      explanation: CONVERSATION_DEMO,
    },
  });
  assert.equal(presented.results[0].accepted, true);
  await receiver.waitForSelector('.explain-window');
  await post('tools', {
    tool: 'control_explanation',
    arguments: { display_ids: [approved.device.id], command: 'pause' },
  });
  await receiver.waitForFunction(() =>
    document
      .querySelector('.explain-header')
      .textContent.includes('angehalten'),
  );
  await post('tools', {
    tool: 'control_explanation',
    arguments: { display_ids: [approved.device.id], command: 'close' },
  });
  await receiver.waitForFunction(
    () =>
      document.querySelector('#receiverState').textContent === 'SECURE LINK',
  );
  await receiver.close();
  // Account UX fixture only: never opens a real OpenAI login or uses credentials.
  const authPage = await browser.newPage();
  let signedIn = false,
    callbackSubmitted = false;
  await authPage.evaluateOnNewDocument(() => {
    window.open = () => ({
      opener: null,
      location: {
        replace(url) {
          window.__testAuthUrl = url;
        },
      },
      close() {},
    });
  });
  await authPage.setRequestInterception(true);
  authPage.on('request', (request) => {
    const endpoint = new URL(request.url()).pathname;
    if (endpoint === '/api/stark/jarvis/status')
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          provider: 'codex',
          available: signedIn,
          loginAvailable: true,
          searchScope: 'wikipedia-only',
          reason: 'Mit ChatGPT anmelden.',
        }),
      });
    if (endpoint === '/api/stark/jarvis/login')
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authUrl: 'https://auth.openai.com/oauth/authorize?state=qa-fixture',
          expiresAt: Date.now() + 60000,
        }),
      });
    if (endpoint === '/api/stark/jarvis/login/complete') {
      assert.equal(request.method(), 'POST');
      assert.match(request.headers()['content-type'], /application\/json/);
      callbackSubmitted = true;
      signedIn = true;
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: '{"available":true}',
      });
    }
    request.continue();
  });
  await authPage.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await authPage.goto(`${origin}/stark/`, { waitUntil: 'networkidle0' });
  await openRingModule(authPage, 'ASSISTANT');
  await authPage.waitForSelector('[data-auth]:not([hidden])');
  await authPage.click('[data-login]');
  await authPage.waitForSelector('[data-remote]:not([hidden])');
  assert.match(
    await authPage.evaluate(() => window.__testAuthUrl),
    /^https:\/\/auth.openai.com\//,
  );
  await authPage.evaluate(() => {
    document.querySelector('[data-remote]').open = true;
    document.querySelector('[data-callback]').value =
      'http://127.0.0.1:1455/auth/callback?code=qa-fixture&state=qa-fixture';
    document.querySelector('[data-callback-form]').requestSubmit();
  });
  await authPage.waitForSelector('[data-account]:not([hidden])');
  assert.equal(callbackSubmitted, true);
  assert.equal(
    await authPage.$eval('[data-callback]', (element) => element.value),
    '',
  );
  assert.equal(
    await authPage.evaluate(() =>
      Object.values(localStorage).some((value) => value.includes('qa-fixture')),
    ),
    false,
  );
  await authPage.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: microphone transcript, offline demo, actual Hermes protocol/tool round trip, voice commands, phone/landscape/desktop layout, rotation state, media/ring access, paired receiver capability refresh and real WebSocket show/pause/close.',
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  await server?.close();
  await new Promise((resolve) => mock.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
