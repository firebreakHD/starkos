// Deterministic QA of the actual upstream renderer through the STARK tools API.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { MARKS, photoFetch } from './fixtures/roamies-marks.mjs';
import { createRoamies } from '../server/stark/roamies.js';
const data = mkdtempSync(path.join(tmpdir(), 'stark-roamies-qa-'));
let gateway, server, browser;
try {
  gateway = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks));
    const last = input.messages.at(-1);
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message:
              last.role === 'tool'
                ? {
                    role: 'assistant',
                    content: 'Die Darstellung ist geöffnet.',
                  }
                : {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'fixture-draw',
                        type: 'function',
                        function: {
                          name: 'draw',
                          arguments: JSON.stringify({
                            beats: [
                              {
                                say: 'Der Controller organisiert die Daten.',
                                marks: [MARKS.model],
                              },
                            ],
                            display_ids: [],
                          }),
                        },
                      },
                    ],
                  },
          },
        ],
      }),
    );
  });
  await new Promise((r) => gateway.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    STARK_ADDON: 'false',
    STARK_DATA_DIR: data,
    STARK_MODEL_PROVIDER: 'gateway',
    STARK_HERMES_URL: `http://127.0.0.1:${gateway.address().port}`,
    STARK_HERMES_MODEL: 'qa-local-fixture',
    GEV_KEY_SETUP_TRUSTED_PEERS: 'none',
  });
  const { preview } = await import('vite');
  server = await preview({
    preview: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.STARK_QA_CHROMIUM || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('browser pageerror:', e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && /^ink[ :]/.test(m.text()))
      errors.push(m.text());
  });
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(origin + '/stark/', { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const { createExplanationPlayer } = await import('./explanation-player.js');
    document.querySelector('#device').hidden = true;
    document.querySelector('#jarvisHome').hidden = false;
    window.inkTest = createExplanationPlayer(
      document.querySelector('[data-explanation]'),
    );
  });
  const draw = async (marks) =>
    page.evaluate(async (marks) => {
      const response = await fetch('../api/stark/tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'draw',
          arguments: {
            beats: [{ say: 'Eine echte Roamies-Darstellung.', marks }],
            display_ids: [],
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(result));
      window.inkTest.showDrawing(result.drawing);
      return result.drawing;
    }, marks);
  const frame = async () => {
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await page.waitForSelector('.roamies-frame');
    const f = await (await page.$('.roamies-frame')).contentFrame();
    await f.waitForFunction(() => window.Roamie?.ink);
    return f;
  };
  let f;
  if (!process.env.STARK_QA_UI_ONLY) {
    const names = [
      'card',
      'note',
      'list',
      'mindmap',
      'clip',
      'sources',
      'graph',
      'legend',
      'timeline',
      'molecule',
      'model',
      'flow',
      'table',
      'bars',
      'map',
      'math',
      'geometry',
      'quiz',
      'ticket',
      'medal',
    ];
    for (const kind of process.env.STARK_QA_FOCUS
      ? process.env.STARK_QA_FOCUS.split(',')
      : names) {
      await draw([MARKS[kind]]);
      const f = await frame();
      await f.waitForFunction(
        (kind) => window.Roamie.ink.snapshot().some((m) => m.kind === kind),
        { timeout: 10000 },
        kind,
      );
      await f.waitForFunction(() => !window.Roamie.ink.playing, {
        timeout: 15000,
      });
      const state = await f.evaluate(() => ({
        phone: window.Roamie.phone,
        parts: window.Roamie.ink.snapshot(),
        fonts: document.fonts.check('500 13px "Martian Mono"'),
      }));
      assert.equal(state.phone, true);
      assert.ok(state.parts.some((m) => m.card));
      assert.ok(
        state.parts.filter((m) => m.card).every((m) => m.scale >= 1.5),
        'phone text enlarged without shrinking the desktop layout',
      );
      assert.equal(state.fonts, true);
      console.log('PASS original Roamies renderer:', kind);
    }
    const photos = createRoamies({ fetchImpl: photoFetch });
    await photos.see({ url: MARKS.photo.url });
    const photo = await photos({
      beats: [
        {
          say: 'Ein Testbild mit Beschriftung.',
          marks: [
            { ...MARKS.photo, labels: [{ text: 'Farbe', x: 0.5, y: 0.5 }] },
          ],
        },
      ],
    });
    await page.evaluate(
      (drawing) => window.inkTest.showDrawing(drawing),
      photo,
    );
    f = await frame();
    await f.waitForFunction(() => !window.Roamie.ink.playing);
    assert.equal(
      await f.evaluate(
        (src) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image.naturalWidth);
            image.onerror = () => resolve(0);
            image.src = src;
          }),
        photo.beats[0].marks[0].src,
      ),
      32,
      'original photo renderer receives a decodable actual image',
    );
    await draw([MARKS.quiz]);
    f = await frame();
    await f.waitForFunction(() => !window.Roamie.ink.playing);
    await f.evaluate(() => {
      window.quizEvents = [];
      const original = window.Roamie.ink.send;
      window.Roamie.ink.send = (e) => {
        window.quizEvents.push(e);
        original(e);
      };
    });
    const picks = await f.evaluate(() =>
      window.Roamie.ink.interactive().filter((hit) => hit.kind === 'pick'),
    );
    assert.ok(picks.length >= 2, 'quiz exposes real hit targets');
    const frameBox = await (await page.$('.roamies-frame')).boundingBox();
    await page.mouse.click(
      frameBox.x + picks[0].rect[0] + 8,
      frameBox.y + picks[0].rect[1] + 8,
    );
    assert.ok(
      await f.evaluate(() =>
        window.Roamie.ink.snapshot().some((m) => m.kind === 'quiz'),
      ),
    );
    await f.waitForFunction(
      () => window.Roamie.ink.textBounds('Right.').length,
    );
    await page.mouse.move(frameBox.x + 40, frameBox.y + 120);
    await page.mouse.wheel({ deltaY: 1000 });
    await f.waitForFunction(() =>
      window.Roamie.ink
        .interactive()
        .some((hit) => hit.kind === 'pick' && hit.id === 'next'),
    );
    const next = await f.evaluate(() =>
      window.Roamie.ink
        .interactive()
        .find((hit) => hit.kind === 'pick' && hit.id === 'next'),
    );
    const viewportBox = await (await page.$('.roamies-viewport')).boundingBox();
    await page.mouse.move(viewportBox.x + 200, viewportBox.y + 140);
    await page.mouse.down();
    await page.mouse.move(viewportBox.x + 30, viewportBox.y + 140, {
      steps: 12,
    });
    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelector('.roamies-viewport').scrollLeft > 0,
    );
    const pannedBox = await (await page.$('.roamies-frame')).boundingBox();
    await page.mouse.click(
      pannedBox.x + next.rect[0] + 8,
      pannedBox.y + next.rect[1] + 8,
    );
    await f.waitForFunction(() =>
      window.quizEvents.some((e) => e.type === 'quiz_done' && e.picks[0] === 0),
    );

    // Actual measured words, not guessed article coordinates: underline a sentence on its source clipping.
    const sourceDrawing = await draw([MARKS.clip]);
    f = await frame();
    await f.waitForFunction(() => !window.Roamie.ink.playing);
    const bounds = await f.evaluate(() =>
      window.Roamie.ink.textBounds('tatsächlich'),
    );
    assert.ok(
      bounds.length,
      'source clipping text exposes actual drawn bounds',
    );
    const annotations = await page.evaluate(async (part) => {
      const result = await (
        await fetch('../api/stark/tools', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            tool: 'draw',
            arguments: {
              beats: [
                {
                  say: 'Diese Stelle ist wichtig.',
                  marks: [{ kind: 'underline', at: { text: 'tatsächlich' } }],
                },
              ],
              edit: [{ do: 'recolor', part, tone: 'amber' }],
            },
          }),
        })
      ).json();
      return result.drawing;
    }, sourceDrawing.beats[0].marks[0].part);
    await page.evaluate(
      (drawing) => window.inkTest.showDrawing(drawing),
      annotations,
    );
    await f.waitForFunction(
      (part) =>
        window.Roamie.ink.snapshot().some((m) => m.screen && m.part === part),
      {},
      annotations.beats[0].marks[0].part,
    );
    // Phone pages vs real simultaneous desktop cards.
    await draw([MARKS.card, MARKS.model]);
    assert.match(
      await page.$eval('.roamies-position', (el) => el.textContent),
      /1 \/ 2/,
    );
    await page.evaluate(() => window.inkTest.control('next'));
    f = await frame();
    await f.waitForFunction(() =>
      window.Roamie.ink.snapshot().some((m) => m.kind === 'model'),
    );
    for (const width of [320, 375, 430, 844, 1440]) {
      await page.setViewport({
        width,
        height: 844,
        isMobile: true,
        hasTouch: true,
      });
      await draw([MARKS.card, MARKS.model]);
      f = await frame();
      await f.waitForFunction(() => !window.Roamie.ink.playing);
      assert.equal(
        await page.evaluate(() => document.body.scrollWidth > innerWidth),
        false,
        'no page-level horizontal overflow',
      );
      if (width >= 1050)
        assert.ok(
          (await f.evaluate(
            () => window.Roamie.ink.snapshot().filter((m) => m.card).length,
          )) >= 2,
          'desktop keeps simultaneous original cards',
        );
    }
    await page.setViewport({
      width: 844,
      height: 390,
      isMobile: true,
      hasTouch: true,
    });
    await draw([MARKS.model]);
    f = await frame();
    await f.waitForFunction(() => !window.Roamie.ink.playing);
    assert.equal(
      await f.evaluate(() => window.Roamie.phone),
      true,
      'landscape phones keep readable focused cards',
    );
    const fits = await f.evaluate(() =>
      window.Roamie.ink
        .snapshot()
        .filter((m) => m.card)
        .every((m) => m.rect[1] + m.rect[3] <= innerHeight + 4),
    );
    assert.equal(
      fits,
      true,
      'landscape cards fit above the dock with scrollable contents',
    );
    await f.waitForFunction(
      () => window.Roamie.ink.textBounds('Platine').length > 0,
    );
    assert.ok(
      await f.evaluate(() =>
        window.Roamie.ink
          .textBounds('Platine')
          .some(([x, y, w, h]) => y >= 0 && y + h <= innerHeight),
      ),
      'landscape model labels are visible without scrolling',
    );
    if (process.env.STARK_QA_OUTPUT) {
      mkdirSync(process.env.STARK_QA_OUTPUT, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.STARK_QA_OUTPUT, 'roamies-desktop.png'),
      });
      await page.setViewport({
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
      });
      await draw([MARKS.model]);
      f = await frame();
      await f.waitForFunction(() => !window.Roamie.ink.playing);
      await page.screenshot({
        path: path.join(process.env.STARK_QA_OUTPUT, 'roamies-phone.png'),
      });
    }
  }
  assert.deepEqual(errors, []);
  // Exercise the normal text->tool->stream->renderer path, including closing the chat.
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.ring-item');
  for (const item of await page.$$('.ring-item'))
    if (await item.$eval('strong', (el) => el.textContent === 'ASSISTANT')) {
      await item.click();
      break;
    }
  await page.waitForFunction(
    () => document.querySelector('#coreTitle').textContent === 'ASSISTANT',
  );
  await page.click('#core');
  if (await page.$eval('#device', (el) => !el.hidden))
    await page.click('#core');
  await page
    .waitForFunction(() => !document.querySelector('#jarvisHome').hidden, {
      timeout: 8000,
    })
    .catch(async (e) => {
      console.log(
        'UI state',
        await page.evaluate(() => ({
          title: document.querySelector('#coreTitle').textContent,
          homeHidden: document.querySelector('#jarvisHome').hidden,
        })),
      );
      throw e;
    });
  await page.focus('[data-chat-grip]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#jarvisChat[open]');
  await page.type('[data-input]', 'Erklär mir das Modell visuell');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.roamies-frame', { timeout: 15000 });
  assert.equal(
    await page.$eval('#jarvisChat', (el) => el.open),
    false,
    'explicit visual chat closes and opens real Ink',
  );
  console.log('PASS actual visual chat stream');
  f = await frame();
  await f.waitForFunction(() =>
    window.Roamie.ink.snapshot().some((m) => m.kind === 'model'),
  );
  await f.waitForFunction(() => !window.Roamie.ink.playing);
  await page.focus('[data-chat-grip]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#jarvisChat[open]');
  await page.type('[data-input]', 'Antworte nur im Chat');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('[data-input]').value === '',
  );
  assert.equal(
    await page.$eval('#jarvisChat', (el) => el.open),
    true,
    'Enter in a plain text chat must not activate the menu or switch to Voice',
  );
  await page.click('[data-chat-close]');
  await page.setViewport({
    width: 1440,
    height: 1000,
    isMobile: true,
    hasTouch: true,
  });
  f = await frame();
  await f.waitForFunction(() => !window.Roamie.ink.playing);
  console.log('Testing native desktop pin across a new answer');
  const pin = await f.evaluate(() =>
    window.Roamie.ink.interactive().find((h) => h.kind === 'pin'),
  );
  assert.ok(pin);
  let box = await (await page.$('.roamies-frame')).boundingBox();
  const ack = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/stark/ink-event') &&
      r.request().postData()?.includes('ink_pinned'),
  );
  await page.mouse.click(box.x + pin.rect[0] + 8, box.y + pin.rect[1] + 8);
  assert.equal((await ack).status(), 200);
  await f.evaluate(() => {
    window.inkHostMessages = [];
    addEventListener('message', (e) => {
      if (e.data?.channel === 'stark-roamies' && e.data.type === 'show')
        window.inkHostMessages.push(e.data);
    });
  });
  const oldPart = await f.evaluate(
    () => window.Roamie.ink.snapshot().find((m) => m.card).part,
  );
  await page.focus('[data-chat-grip]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#jarvisChat[open]');
  await page.type('[data-input]', 'Erklär mir das Modell visuell');
  await page.keyboard.press('Enter');
  await f.waitForFunction(
    (part) =>
      window.Roamie.ink.snapshot().some((m) => m.part !== part && m.card),
    {},
    oldPart,
  );
  assert.ok(
    await f.evaluate(
      (part) => window.Roamie.ink.snapshot().some((m) => m.part === part),
      oldPart,
    ),
    'pinned original card survives the next real agent drawing',
  );
  assert.ok(
    await f.evaluate(
      (part) =>
        window.inkHostMessages.some((message) =>
          message.parts.includes(part + ' '),
        ),
      oldPart,
    ),
    'server retained the actual pinned part after authenticated UI feedback',
  );
  console.log(
    'PASS: original Roamies marks, measured source annotation, phone focus, desktop cards, real tool stream and chat policy. Local model fixture; no live provider or microphone.',
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.httpServer.close(r));
  if (gateway) await new Promise((r) => gateway.close(r));
  rmSync(data, { recursive: true, force: true });
}
