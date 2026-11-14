// Deterministic browser QA: a local protocol fixture, never a live/second agent.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { CONVERSATION_DEMO } from '../public/stark/conversation-demo.js';

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
  await page.waitForFunction(() =>
    document.querySelector('[data-status]').textContent.startsWith('Bereit.'),
  );
  assert.equal(await page.$eval('#device', (el) => el.hidden), true);
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
      document.querySelector('[data-text-options]').open = true;
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
  await send('bleib hier');
  const output =
    process.env.STARK_QA_OUTPUT || path.join(temporary, 'screenshots');
  await mkdir(output, { recursive: true });
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
  await send('Öffne Medien');
  await page.waitForSelector('.panel.open .stark-browser');
  await page.click('#browserBack');
  await page.click('#browseModules');
  assert.equal(await page.$eval('#device', (el) => el.hidden), false);
  await page.click('#backToJarvis');
  assert.equal(await page.$eval('#jarvisHome', (el) => el.hidden), false);
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
