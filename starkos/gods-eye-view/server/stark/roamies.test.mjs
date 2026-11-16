import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoamies, ROAMIES_TOOL, pinnedInkFetch } from './roamies.js';
import {
  MARKS,
  PNG,
  photoFetch,
} from '../../scripts/fixtures/roamies-marks.mjs';
import { codexTurnInput } from './codex.js';
const request = (mark) => ({
  beats: [{ say: 'Eine kurze Erklärung.', marks: [structuredClone(mark)] }],
});
test('all original Roamies card types validate and prepare actual upstream structures', async () => {
  const draw = createRoamies({ fetchImpl: photoFetch });
  for (const [kind, mark] of Object.entries(MARKS)) {
    const result = await draw(request(mark));
    assert.equal(result.beats[0].marks[0].kind, kind);
    assert.match(result.parts, /p\d+/);
    const prepared = result.beats[0].marks[0];
    if (kind === 'model') assert.deepEqual(prepared.parts[1].size, [1, 1, 1]);
    if (kind === 'flow') assert.ok(prepared.lay);
    if (kind === 'molecule') assert.ok(prepared.mol);
    if (kind === 'map') assert.ok(prepared.view);
    if (kind === 'math') assert.ok(prepared.steps[0].tree);
    if (kind === 'quiz') assert.equal(prepared.questions[0].right, 0);
  }
  assert.equal(ROAMIES_TOOL.name, 'draw');
});
test('photo labels require see_photo and use that actual cached picture, isolated by conversation', async () => {
  const draw = createRoamies({ fetchImpl: photoFetch });
  const photo = { ...MARKS.photo, labels: [{ text: 'Bild', x: 0.5, y: 0.5 }] };
  await assert.rejects(draw({ ...request(photo), session: 'a' }), /see_photo/);
  const seen = await draw.see({ url: photo.url, session: 'a' });
  assert.equal(seen.data, PNG);
  const result = await draw({ ...request(photo), session: 'a' });
  assert.equal(result.beats[0].marks[0].src, 'data:image/png;base64,' + PNG);
  await assert.rejects(draw({ ...request(photo), session: 'b' }), /see_photo/);
});
test('edits refer to real drawing part IDs and cannot cross conversations', async () => {
  const draw = createRoamies();
  await draw({ ...request(MARKS.card), session: 'a' });
  assert.equal(
    (
      await draw({
        edit: [{ do: 'recolor', part: 'p1', tone: 'amber' }],
        session: 'a',
      })
    ).edits.length,
    1,
  );
  await assert.rejects(
    draw({ edit: [{ do: 'erase', part: 'p1' }], session: 'b' }),
    /existiert/,
  );
  await draw({ edit: [{ do: 'erase', part: 'p1' }], session: 'a' });
  await assert.rejects(
    draw({ edit: [{ do: 'move', part: 'p1', dx: 10 }], session: 'a' }),
    /existiert/,
  );
});
test('original structural bounds, unsafe actions and invalid source URLs are rejected', async () => {
  const draw = createRoamies();
  for (const kind of ['type', 'open', 'copy', 'handoff'])
    await assert.rejects(
      draw(
        request({
          kind,
          text: 'x',
          task: 'x',
          url: 'https://example.org',
          at: { x: 20, y: 20 },
        }),
      ),
    );
  await assert.rejects(
    draw(request({ kind: 'table', columns: ['a', 'b'], rows: [['only one']] })),
    /cell/,
  );
  await assert.rejects(
    draw(
      request({ ...MARKS.model, parts: Array(41).fill(MARKS.model.parts[0]) }),
    ),
  );
  await assert.rejects(
    draw(request({ ...MARKS.clip, url: 'javascript:alert(1)' })),
    /HTTPS/,
  );
  await assert.rejects(
    pinnedInkFetch('https://127.0.0.1/test'),
    /Netzwerkadressen/,
  );
  await assert.rejects(pinnedInkFetch('http://example.org'), /HTTPS/);
  await assert.rejects(
    draw(
      request({
        kind: 'arrow',
        points: [
          [0, 0],
          [1e20, 1],
        ],
      }),
    ),
    /Referenzraum/,
  );
  await assert.rejects(
    draw(
      request({ kind: 'write', at: { x: 50, y: 50 }, text: 'x', size: 1e20 }),
    ),
    /Schriftgröße/,
  );
});
test('Codex receives the actual photo as protocol image input without filesystem tools or base64 text duplication', () => {
  const input = codexTurnInput(
    [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,' + PNG },
          },
        ],
      },
    ],
    [],
  );
  assert.equal(input[1].type, 'image');
  assert.equal(input[1].url, 'data:image/png;base64,' + PNG);
  assert.ok(!input[0].text.includes(PNG));
  assert.throws(
    () =>
      codexTurnInput(
        [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'file:///etc/passwd' } },
            ],
          },
        ],
        [],
      ),
    /Ungültiges/,
  );
});

test('actual Codex tool loop emits Roamies drawings and blocks them in text-only chat', async () => {
  const { createJarvis } = await import('./jarvis.js');
  const draw = createRoamies();
  let attempts = 0;
  const events = [];
  const agent = createJarvis({
    env: {},
    codex: {
      status: async () => ({ available: true }),
      completion: async () =>
        ++attempts === 1
          ? {
              tool_calls: [
                {
                  id: 'draw-call',
                  type: 'function',
                  function: {
                    name: 'draw',
                    arguments: JSON.stringify(request(MARKS.model)),
                  },
                },
              ],
            }
          : { content: 'Fertig.' },
      dispose() {},
    },
    executeTool: async (name, args) => ({
      drawing: await draw(args),
      results: [],
    }),
  });
  await agent.turn(
    { text: 'Erklär mir die Mechanik visuell', mode: 'voice' },
    { emit: (e) => events.push(e) },
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === 'drawing' && e.drawing.beats[0].marks[0].kind === 'model',
    ),
  );
  attempts = 0;
  events.length = 0;
  await agent.turn(
    { text: 'Antworte nur im Chat', mode: 'chat' },
    { emit: (e) => events.push(e) },
  );
  assert.ok(!events.some((e) => e.type === 'drawing'));
  await agent.dispose();
});

test('draw sends real receiver commands only to online paired Ink-capable displays', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DisplayStore } = await import('./display-store.js');
  const { createDisplayService } = await import('./receiver.js');
  const { WebSocket } = await import('ws');
  const directory = mkdtempSync(join(tmpdir(), 'ink-displays-'));
  try {
    const store = new DisplayStore(directory);
    store.addDevice({
      id: 'capable',
      name: 'Ink',
      token: 'test-device-token-with-enough-entropy',
      capabilities: ['ink.roamies'],
    });
    store.addDevice({
      id: 'legacy',
      name: 'Legacy',
      token: 'different-test-device-token-entropy',
      capabilities: ['explanation.scenes'],
    });
    const service = createDisplayService({ store });
    const sent = [];
    service.sockets.set('capable', {
      readyState: WebSocket.OPEN,
      send: (value) => sent.push(JSON.parse(value)),
    });
    const result = await service.executeTool('draw', {
      ...request(MARKS.graph),
      display_ids: ['capable', 'legacy'],
    });
    assert.equal(result.results[0].accepted, true);
    assert.equal(result.results[1].accepted, false);
    assert.match(result.results[1].error, /ink.roamies/);
    assert.equal(sent[0].command.action, 'ink.draw');
    assert.ok(sent[0].command.sessionId);
    assert.equal(
      sent[0].command.payload.drawing.beats[0].marks[0].kind,
      'graph',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('only the trusted Ink document may be framed on the same origin; all other CSP directives are preserved', async () => {
  const { embedFramingPlugin } = await import('../../build/embed-framing.js');
  let middleware;
  embedFramingPlugin({
    selfFramedPaths: ['/stark/roamies/frame.html'],
  }).configurePreviewServer({
    middlewares: {
      use: (fn) => {
        middleware = fn;
      },
    },
  });
  for (const [url, allowed] of [
    ['/stark/roamies/frame.html', true],
    ['/stark/index.html', false],
    ['/stark/roamies/frame.html.evil', false],
  ]) {
    const headers = {};
    const res = {
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
    };
    middleware({ url, socket: {} }, res, () => {});
    res.setHeader(
      'Content-Security-Policy',
      "script-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader('X-Frame-Options', 'DENY');
    assert.match(
      headers['content-security-policy'],
      /script-src 'self'; object-src 'none'/,
    );
    assert.ok(
      headers['content-security-policy'].includes(
        allowed ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
      ),
    );
    assert.equal(headers['x-frame-options'], allowed ? 'SAMEORIGIN' : 'DENY');
  }
});

test('actual pin/close feedback preserves native part IDs through new drawings and explicit clear removes them',async()=>{
 const draw=createRoamies();const first=await draw(request(MARKS.card));const part=first.beats[0].marks[0].part;
 assert.equal(draw.event({drawingId:first.id,event:{type:'ink_pinned',part,on:true}}).accepted,true);
 const second=await draw(request(MARKS.model));assert.ok(second.parts.includes(part+' '));
 await draw({edit:[{do:'recolor',part,tone:'amber'}]});
 draw.event({drawingId:second.id,event:{type:'ink_closed',part}});
 await assert.rejects(draw({edit:[{do:'erase',part}]}),/existiert/);
 assert.equal(draw.event({drawingId:'unknown',event:{type:'ink_pinned',part,on:true}}).accepted,false);
});
