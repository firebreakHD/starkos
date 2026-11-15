// Deterministic browser QA: a local protocol fixture, never a live/second agent.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { CONVERSATION_DEMO } from '../public/stark/conversation-demo.js';
import { USB_DEMO } from '../public/stark/visual-demo.js';

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
const USB_QUESTION = 'Erklär mir kurz Wie ein usb Stick funktioniert visuel';
const USB_EXPLANATION = USB_DEMO;
const mock = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  calls.push(body);
  const last = body.messages.at(-1);
  const usbRequest = body.messages.some(
    (m) => m.role === 'user' && m.content === USB_QUESTION,
  );
  const message =
    usbRequest && last.role === 'user'
      ? {
          role: 'assistant',
          content:
            'USB-Stick: Computer → Controller → Flash-Speicher (Textdiagramm)',
        }
      : last.role === 'tool'
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
                    explanation: usbRequest
                      ? USB_EXPLANATION
                      : CONVERSATION_DEMO,
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
        window.__lastRecognition = this;
        this.onstart?.();
        if (window.__manualRecognition) return;
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
  assert.equal(await page.$$eval('.ring-item', (entries) => entries.length), 4);
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
  assert.deepEqual(
    await page.$$eval('.ring-item strong', (nodes) =>
      nodes.map((n) => n.textContent),
    ),
    ['MEDIA', 'Gods Eye', 'RECEIVER', 'ASSISTANT'],
  );
  await page.click('#openSettings');
  await page.waitForSelector('.panel.open #accountSettings');
  await page.click('#closePanel');
  await openRingModule(page, 'ASSISTANT');
  await page.waitForFunction(() =>
    document.querySelector('[data-scope]').textContent.includes('Recherche:'),
  );
  assert.equal(await page.$eval('[data-explanation]', (el) => el.hidden), true);
  assert.equal(await page.$eval('[data-answer]', (el) => el.hidden), true);
  assert.equal(await page.$('#jarvisHome [data-auth]'), null);
  assert.equal(await page.$('#jarvisHome h1'), null);
  if (process.env.STARK_QA_OUTPUT)
    await page.screenshot({
      path: path.join(process.env.STARK_QA_OUTPUT, 'stark-empty-assistant.png'),
    });
  assert.equal(await page.$eval('#device', (el) => el.hidden), true);
  assert.equal(await page.$eval('[data-chat]', (el) => el.open), false);
  assert.equal(await page.$('[data-text-options]'), null);
  const openChatByDrag = async () => {
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-chat-grip]');
      return !e.hidden && e.getBoundingClientRect().width <= 54;
    });
    const box = await page.$eval('[data-chat-grip]', (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await new Promise((resolve) => setTimeout(resolve, 140));
    assert.equal(
      await page.$eval('[data-chat-grip]', (el) =>
        el.classList.contains('is-pressed'),
      ),
      true,
      'press morphs the handle into a circle',
    );
    await new Promise((resolve) => setTimeout(resolve, 410));
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
    const left = await page.$eval(
      '[data-chat-grip]',
      (el) => el.getBoundingClientRect().left,
    );
    await page.mouse.move(box.x + 50, box.y, { steps: 3 });
    const stretching = await page.$eval('[data-chat-grip]', (el) => ({
      left: el.getBoundingClientRect().left,
      width: el.getBoundingClientRect().width,
    }));
    assert.ok(
      Math.abs(stretching.left - left) < 1,
      'the pill stays anchored at the edge',
    );
    assert.ok(
      stretching.width > 100,
      'drag stretches the pill instead of translating it',
    );
    assert.equal(
      await page.$eval('[data-chat]', (el) => el.open),
      false,
      'drag preview never opens/focuses the real dialog',
    );
    assert.equal(
      await page.$eval('.chat-pull-preview', (el) => el.hidden),
      false,
      'real conversation layout is revealed during the pull',
    );
    assert.equal(
      await page.$eval('.chat-pull-preview', (el) => el.inert),
      true,
      'preview stays inert',
    );
    assert.equal(
      await page.$$eval('.chat-pull-preview [id]', (nodes) => nodes.length),
      0,
      'preview creates no duplicate IDs',
    );
    assert.ok(
      await page.$eval(
        '[data-mic]',
        (el) => Number(getComputedStyle(el).opacity) < 1,
      ),
      'voice control yields to the reveal',
    );
    if (
      process.env.STARK_QA_OUTPUT &&
      (await page.evaluate(() => innerWidth <= 700))
    )
      await page.screenshot({
        path: path.join(process.env.STARK_QA_OUTPUT, 'stark-chat-pull.png'),
      });
    await page.mouse.move(box.x + 140, box.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForSelector('[data-chat][open]');
  };
  await page.click('[data-chat-grip]');
  assert.equal(
    await page.$eval('[data-chat-grip]', (el) =>
      el.classList.contains('is-tapped'),
    ),
    true,
    'a short tap gives round visual feedback',
  );
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
  await page.mouse.move(cancelPoint.x + 50, cancelPoint.y, { steps: 3 });
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
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    await page.$eval('.chat-pull-preview', (el) => el.hidden),
    true,
    'cancelled pull retracts the preview',
  );
  assert.equal(
    await page.$eval('#jarvisHome', (el) =>
      el.classList.contains('chat-pulling'),
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
  await page.evaluate(() => {
    window.__manualRecognition = true;
    window.__lastRecognition = null;
  });
  await page.click('[data-mic]');
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(
    await page.$eval('[data-chat]', (el) => el.open),
    false,
    'a single J tap never opens chat',
  );
  assert.equal(
    await page.evaluate(() => Boolean(window.__lastRecognition)),
    false,
    'a short tap does not start speech',
  );
  const doubleTapMic = async () => {
    await page.click('[data-mic]');
    await page.click('[data-mic]');
  };
  await doubleTapMic();
  assert.equal(
    await page.$eval('[data-mic]', (el) => el.dataset.mode),
    'toggle',
  );
  assert.equal(
    await page.$eval('[data-mic]', (el) => el.getAttribute('aria-pressed')),
    'true',
  );
  assert.equal(await page.$eval('[data-chat]', (el) => el.open), false);
  await page.evaluate(() => {
    window.__previousRecognition = window.__lastRecognition;
    window.__lastRecognition.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: 'bleib hier' }], { isFinal: true }),
      ],
    });
    window.__lastRecognition.onend();
  });
  await page.waitForFunction(
    () => window.__lastRecognition !== window.__previousRecognition,
  );
  assert.equal(
    await page.$eval('[data-mic]', (el) => el.dataset.mode),
    'toggle',
    'hands-free mode rearms after a turn',
  );
  await doubleTapMic();
  assert.equal(
    await page.$eval('[data-mic]', (el) => el.getAttribute('aria-pressed')),
    'false',
  );
  assert.equal(await page.$eval('[data-chat]', (el) => el.open), false);
  await page.evaluate(() => {
    window.__manualRecognition = false;
  });
  await page.focus('[data-mic]');
  await page.keyboard.down(' ');
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up(' ');
  assert.equal(
    await page.$eval('[data-explanation]', (el) => el.hidden),
    true,
    'focus loss discards recording',
  );
  const micBox = await page.$eval('[data-mic]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(micBox.x, micBox.y);
  await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(
    await page.$eval('[data-explanation]', (el) => el.hidden),
    true,
    'hold buffers recognition without sending',
  );
  await page.mouse.up();
  await page.waitForSelector('.explain-window');
  console.log('PASS: hold-to-talk release and cancellation');
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
    await page.waitForFunction(
      (narrow) =>
        document
          .querySelector('.explain-header')
          .textContent.includes('Fenster') === narrow,
      {},
      size.width < 1086,
    );
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
      .querySelector('[data-chat-log]')
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
    await page.$eval('[data-chat]', (el) => el.open),
    true,
    'ordinary chat keeps its drawer open',
  );
  assert.equal(
    await page.$eval('[data-explanation]', (el) => el.hidden),
    true,
    'server rejects unsolicited chat visuals',
  );
  assert.equal(await page.$eval('[data-answer]', (el) => el.hidden), true);
  assert.ok(
    JSON.parse(calls[1].messages.at(-1).content).error,
    'server enforces text-only independently',
  );
  await send(USB_QUESTION);
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-chat]').open &&
      !document.querySelector('[data-explanation]').hidden,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-answer]')
      .textContent.includes('Testdarstellung'),
  );
  assert.equal(
    calls.length,
    5,
    'text-only draft is corrected through a real tool call',
  );
  assert.ok(!JSON.parse(calls[4].messages.at(-1).content).error);
  assert.equal(await page.$$eval('.ink-model', (nodes) => nodes.length), 1);
  assert.match(
    await page.$eval('[data-explanation]', (el) => el.textContent),
    /USB-Anschluss/,
  );
  assert.doesNotMatch(
    await page.$eval('[data-chat-log]', (el) => el.textContent),
    /\(Textdiagramm\)/,
  );
  await page.waitForSelector('.visual-legend', { visible: true });
  const legendMetrics = await page.$eval('.visual-legend', (el) => ({
    font: parseFloat(
      getComputedStyle(el.querySelector('.visual-legend-item')).fontSize,
    ),
    overflow: el.scrollWidth > el.clientWidth,
  }));
  assert.ok(
    legendMetrics.font >= 19,
    'mobile labels have real readable CSS pixel sizes',
  );
  assert.equal(legendMetrics.overflow, false);
  assert.equal(
    await page.$eval('.boot-noise', (el) => getComputedStyle(el).display),
    'none',
    'no scanline overlay over assistant text',
  );
  assert.equal(
    await page.$eval(
      '.explain-caption',
      (el) => el.scrollHeight > el.clientHeight,
    ),
    false,
    'caption is not clipped or internally scrolled',
  );
  assert.equal(
    await page.evaluate(() => {
      const content = document
        .querySelector('[data-explanation]')
        .getBoundingClientRect();
      const controls = document
        .querySelector('.jarvis-controls')
        .getBoundingClientRect();
      return content.bottom <= controls.top + 1;
    }),
    true,
    'presentation text scrolls entirely above the control dock',
  );
  for (const width of [320, 375, 390]) {
    await page.setViewport({
      width,
      height: 744,
      isMobile: true,
      hasTouch: true,
    });
    await page.waitForFunction(() => document.querySelector('.visual-legend'));
    // Resizing may rebuild the legend between Puppeteer's selector lookup
    // and evaluation. Read the live element in the same browser callback.
    const sizes = await page.evaluate(() => {
      const el = document.querySelector('.visual-legend');
      return {
        font: parseFloat(getComputedStyle(el.querySelector('li')).fontSize),
        overflow: el.scrollWidth > el.clientWidth,
      };
    });
    assert.ok(
      sizes.font >= 19,
      `legend text at ${width}px: ${JSON.stringify(sizes)}`,
    );
    assert.equal(sizes.overflow, false, `readable labels fit ${width}px`);
  }
  if (process.env.STARK_QA_OUTPUT) {
    await page.$eval('[data-explanation]', (el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.screenshot({
      path: path.join(process.env.STARK_QA_OUTPUT, 'stark-phone-reading.png'),
    });
    await page.$eval('[data-explanation]', (el) => {
      el.scrollTop = 0;
    });
  }
  const modelPath = () =>
    page.$eval('.ink-model .ink-stroke', (el) => el.getAttribute('d'));
  const initialPath = await modelPath();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.notEqual(await modelPath(), initialPath, '3D geometry really rotates');
  await send('bleib hier');
  const pausedPath = await modelPath();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await modelPath(), pausedPath, 'pause freezes model geometry');
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (process.env.STARK_QA_OUTPUT)
    await page.screenshot({
      path: path.join(process.env.STARK_QA_OUTPUT, 'stark-usb-visual.png'),
    });
  await page.setViewport({
    width: 1440,
    height: 1000,
    isMobile: true,
    hasTouch: true,
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.explain-window').length === 2,
  );
  assert.equal(await page.$$eval('.ink-model', (nodes) => nodes.length), 1);
  if (process.env.STARK_QA_OUTPUT)
    await page.screenshot({
      path: path.join(
        process.env.STARK_QA_OUTPUT,
        'stark-workspace-desktop.png',
      ),
    });
  const windowBar = await page.$eval(
    '.explain-note .explain-window-bar',
    (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + 50, y: r.y + r.height / 2, left: r.left };
    },
  );
  await page.mouse.move(windowBar.x, windowBar.y);
  await page.mouse.down();
  await page.mouse.move(windowBar.x - 30, windowBar.y + 20, { steps: 4 });
  await page.mouse.up();
  const moved = await page.$eval(
    '.explain-note .explain-window-bar',
    (el) => el.getBoundingClientRect().left,
  );
  assert.ok(
    Math.abs(moved - (windowBar.left - 30)) < 2,
    'floating windows move by their title bars',
  );
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.explain-window').length === 1,
  );
  await send('weiter');
  await send('weiter');
  assert.equal(await page.$$eval('.ink-canvas', (nodes) => nodes.length), 1);
  assert.match(
    await page.$eval('.ink-canvas', (el) => el.textContent),
    /Flash-Speicher/,
  );
  await page.waitForFunction(() => document.querySelector('.explain-drawing'));
  await new Promise((resolve) => setTimeout(resolve, 3500));
  if (process.env.STARK_QA_OUTPUT)
    await page.screenshot({
      path: path.join(process.env.STARK_QA_OUTPUT, 'stark-usb-drawing.png'),
    });

  await send('bleib hier');
  const output =
    process.env.STARK_QA_OUTPUT || path.join(temporary, 'screenshots');
  await mkdir(output, { recursive: true });
  await openChatByDrag();
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
  await page.waitForFunction(
    () =>
      Math.abs(document.querySelector('#panel').getBoundingClientRect().top) <
      1,
  );
  await page.click('#browserBack');
  await page.waitForFunction(
    () =>
      document.querySelector('#panel').getBoundingClientRect().top >=
      innerHeight,
  );
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
    await page.$eval('[data-explanation]', (el) => el.hidden),
    true,
    'reentry clears the presentation canvas',
  );
  assert.equal(await page.$eval('[data-answer]', (el) => el.hidden), true);
  console.log(
    'PASS: empty canvas, menu, chat presentation policy and responsive layouts',
  );
  if (process.env.STARK_QA_VIDEO && process.env.STARK_QA_OUTPUT) {
    const recorder = await page.screencast({
      path: path.join(process.env.STARK_QA_OUTPUT, 'stark-usb-demo.webm'),
      fps: 15,
    });
    await send('USB Demo');
    await page.waitForSelector('.ink-model');
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await send('weiter');
    await page.waitForSelector('.explain-drawing');
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await recorder.stop();
    await send('Fenster schließen');
  }
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
  await receiver.setViewport({ width: 1440, height: 1000 });
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
      explanation: USB_DEMO,
    },
  });
  assert.equal(presented.results[0].accepted, true);
  await receiver.waitForSelector('.explain-window');
  await receiver.waitForSelector('.ink-model');
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
  const orbitPlan = {
    title: 'QA · geometrisches Schema',
    scenes: [
      {
        title: 'QA · Modell und Zeitlinie',
        narration: 'Lokales Geometriebeispiel, keine astronomische Messung.',
        seconds: 30,
        windows: [
          {
            kind: 'model',
            title: 'Körper und Ring',
            text: 'Schematische Geometrie.',
            model: {
              parts: [
                {
                  shape: 'sphere',
                  label: 'Körper',
                  x: 0,
                  y: 0,
                  z: 0,
                  width: 65,
                  height: 65,
                  depth: 65,
                },
                {
                  shape: 'ring',
                  label: 'Ring',
                  x: 0,
                  y: 0,
                  z: 0,
                  width: 160,
                  height: 20,
                  depth: 160,
                },
              ],
            },
          },
          {
            kind: 'timeline',
            title: 'Beispielablauf',
            text: 'QA-Daten.',
            entries: [
              { label: 'Schritt 1', detail: 'Frage' },
              { label: 'Schritt 2', detail: 'Untersuchung' },
              { label: 'Schritt 3', detail: 'Ergebnis' },
            ],
          },
        ],
      },
    ],
  };
  await post('tools', {
    tool: 'present_explanation',
    arguments: { display_ids: [approved.device.id], explanation: orbitPlan },
  });
  await receiver.waitForSelector('.explain-timeline .ink-canvas');
  assert.match(
    await receiver.$eval('.explain-timeline', (el) => el.textContent),
    /Schritt 3/,
  );
  assert.equal(await receiver.$$eval('.ink-model', (nodes) => nodes.length), 1);
  await receiver.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  // A fresh presentation applies the preference before creating its renderer.
  await post('tools', {
    tool: 'present_explanation',
    arguments: { display_ids: [approved.device.id], explanation: orbitPlan },
  });
  await receiver.waitForSelector('.explain-timeline');
  const still = await receiver.$eval('.ink-model .ink-stroke', (el) =>
    el.getAttribute('d'),
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(
    await receiver.$eval('.ink-model .ink-stroke', (el) =>
      el.getAttribute('d'),
    ),
    still,
    'reduced motion disables model rotation',
  );
  if (process.env.STARK_QA_OUTPUT)
    await receiver.screenshot({
      path: path.join(process.env.STARK_QA_OUTPUT, 'stark-orbit-timeline.png'),
    });
  await receiver.close();
  console.log('PASS: paired receiver path');
  const unsupported = await browser.newPage();
  const unsupportedErrors = [];
  unsupported.on('pageerror', (error) => unsupportedErrors.push(error.message));
  await unsupported.evaluateOnNewDocument(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  await unsupported.setViewport({
    width: 390,
    height: 744,
    isMobile: true,
    hasTouch: true,
  });
  await unsupported.goto(`${origin}/stark/`, { waitUntil: 'networkidle0' });
  await openRingModule(unsupported, 'ASSISTANT');
  await unsupported.click('[data-mic]');
  assert.equal(await unsupported.$eval('[data-chat]', (el) => el.open), false);
  await unsupported.focus('[data-mic]');
  await unsupported.keyboard.down(' ');
  await unsupported.keyboard.up(' ');
  await unsupported.waitForSelector('[data-notice]:not([hidden])');
  assert.equal(
    await unsupported.$eval('[data-chat]', (el) => el.open),
    false,
    'unsupported speech never opens chat',
  );
  assert.match(
    await unsupported.$eval('[data-notice]', (el) => el.textContent),
    /Spracheingabe nicht/,
  );
  assert.deepEqual(unsupportedErrors, []);
  await unsupported.close();
  // Account UX fixture only: never opens a real OpenAI login or uses credentials.
  const authPage = await browser.newPage();
  let signedIn = false,
    callbackSubmitted = false,
    authStatusMode = 'signed-out';
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
    if (
      endpoint === '/api/stark/jarvis/status' &&
      authStatusMode === 'status-error'
    )
      return request.respond({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"temporary status failure"}',
      });
    if (endpoint === '/api/stark/jarvis/status')
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          provider: 'codex',
          available: signedIn,
          loginAvailable: authStatusMode !== 'unavailable',
          loginPending: !signedIn && authStatusMode === 'pending',
          loginExpiresAt:
            authStatusMode === 'pending' ? Date.now() + 60000 : null,
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
      if (
        JSON.parse(request.postData()).callbackUrl.startsWith(
          'https://auth.openai.com',
        )
      )
        return request.respond({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error:
              'Bitte die vollständige Weiterleitungsadresse einfügen, nicht den OpenAI-Anmeldelink.',
          }),
        });
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
  await authPage.click('#openSettings');
  await authPage.waitForSelector('.panel.open #accountSettings');
  await authPage.waitForFunction(
    () => document.querySelector('#panel').getBoundingClientRect().top <= 1,
  );
  await authPage.waitForSelector('[data-auth]:not([hidden])');
  await authPage.waitForSelector('[data-callback]', {
    visible: true,
    timeout: 1500,
  });
  // The field is unconditional while signed out, even with no pending login,
  // an unavailable Codex runtime or a failed status endpoint.
  for (const mode of ['unavailable', 'status-error', 'pending']) {
    authStatusMode = mode;
    await authPage.reload({ waitUntil: 'networkidle0' });
    await authPage.click('#openSettings');
    await authPage.waitForSelector('.panel.open #accountSettings');
    await authPage.waitForFunction(
      () => document.querySelector('#panel').getBoundingClientRect().top <= 1,
    );
    await authPage.waitForSelector('[data-callback]', { visible: true });
    assert.equal(
      await authPage.$eval('[data-remote]', (el) => el.hidden),
      false,
      `return field remains reachable: ${mode}`,
    );
  }
  await authPage.waitForFunction(
    () => document.querySelector('#panel').getBoundingClientRect().top <= 1,
  );
  await authPage.screenshot({
    path: path.join(output, 'stark-settings-check.png'),
  });
  assert.equal(
    await authPage.$eval('[data-callback]', (el) => {
      const box = el.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    }),
    true,
    'phone return field is on screen without scrolling',
  );
  await authPage.screenshot({
    path: path.join(output, 'stark-login-field.png'),
    fullPage: true,
  });
  assert.equal(
    await authPage.$('#jarvisHome [data-callback]'),
    null,
    'account stays in menu settings',
  );
  await authPage.click('[data-login]');
  await authPage.waitForSelector('[data-remote]:not([hidden])');
  await authPage.waitForFunction(
    () => typeof window.__testAuthUrl === 'string',
  );
  assert.match(
    await authPage.evaluate(() => window.__testAuthUrl),
    /^https:\/\/auth.openai.com\//,
  );
  await authPage.reload({ waitUntil: 'networkidle0' });
  await authPage.click('#openSettings');
  await authPage.waitForSelector('.panel.open #accountSettings');
  await authPage.waitForFunction(
    () => document.querySelector('#panel').getBoundingClientRect().top <= 1,
  );
  await authPage.waitForSelector('[data-callback]', { visible: true });
  await authPage.type(
    '[data-callback]',
    'https://auth.openai.com/oauth/authorize',
  );
  await authPage.click('[data-callback-submit]');
  await authPage.waitForFunction(() =>
    document
      .querySelector('[data-auth-progress]')
      .textContent.includes('nicht den OpenAI-Anmeldelink'),
  );
  assert.equal(
    await authPage.$eval('[data-callback-submit]', (el) => el.disabled),
    false,
    'bad links must not leave the form stuck',
  );
  assert.equal(await authPage.$eval('[data-remote]', (el) => el.hidden), false);
  await authPage.evaluate(() => {
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
