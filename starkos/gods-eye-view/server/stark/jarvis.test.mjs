import assert from 'node:assert/strict';
import test from 'node:test';
import { createJarvis } from './jarvis.js';
import { validateExplanation } from '../../public/stark/explanation-contract.js';
import { CONVERSATION_DEMO } from '../../public/stark/conversation-demo.js';

const env = {
  STARK_MODEL_PROVIDER: 'gateway',
  STARK_HERMES_URL: 'https://hermes.example/v1/chat/completions',
  STARK_HERMES_MODEL: 'hermes',
  STARK_HERMES_API_KEY: 'not-a-real-key',
};
const call = (name, args, id = 't1') => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
const reply = (message) =>
  Response.json({ choices: [{ message: { role: 'assistant', ...message } }] });

test('default Codex transport uses the same STARK tool loop and sign-out clears history', async () => {
  let calls = 0;
  let executed = 0;
  const events = [];
  const agent = createJarvis({
    env: {},
    codex: {
      status: async () => ({ provider: 'codex', available: true }),
      completion: async () =>
        calls++ === 0
          ? { tool_calls: [call('list_displays', {})] }
          : { content: 'Fertig.' },
      logout: async () => ({ available: false }),
      dispose() {},
    },
    executeTool: () => {
      executed++;
      return { displays: [] };
    },
  });
  await agent.turn(
    { text: 'Liste Displays' },
    { emit: (event) => events.push(event) },
  );
  assert.equal(executed, 1);
  assert.equal(calls, 2);
  assert.equal((await agent.status()).provider, 'codex');
  const id = events[0].conversationId;
  await agent.logout();
  await assert.rejects(
    () => agent.turn({ text: 'Noch einmal', conversationId: id }),
    /abgelaufen/,
  );
});

test('missing Hermes config is unavailable and never fabricates a reply', async () => {
  let called = false;
  const agent = createJarvis({
    env: { STARK_MODEL_PROVIDER: 'gateway' },
    fetchImpl: () => {
      called = true;
    },
  });
  assert.equal((await agent.status()).available, false);
  await assert.rejects(
    () => agent.turn({ text: 'Hallo' }),
    /noch nicht verbunden/,
  );
  assert.equal(called, false);
  assert.doesNotMatch(
    JSON.stringify(await agent.status()),
    /API_KEY|not-a-real/,
  );
});

test('one Hermes tool loop reads evidence, presents a validated scene and retains conversation context', async () => {
  const events = [],
    requests = [],
    executed = [];
  let index = 0;
  const explanation = {
    title: 'Test',
    scenes: [
      {
        title: 'Beleg',
        narration: 'Hier steht es.',
        windows: [
          {
            kind: 'source',
            title: 'Original',
            text: 'Ein exakter Auszug.',
            url: 'https://example.org/article',
            highlight: 'exakter',
          },
        ],
      },
    ],
  };
  const responses = [
    {
      tool_calls: [call('read_source', { url: 'https://example.org/article' })],
    },
    {
      tool_calls: [
        call('present_explanation', { display_ids: [], explanation }, 't2'),
      ],
    },
    { content: 'Das ist der belegte Auszug.' },
    { content: 'Wir sprachen über den Auszug.' },
  ];
  const agent = createJarvis({
    env,
    fetchImpl: async (url, opts) => {
      assert.equal(String(url), env.STARK_HERMES_URL);
      assert.equal(opts.headers.Authorization, 'Bearer not-a-real-key');
      requests.push(JSON.parse(opts.body));
      return reply(responses[index++]);
    },
    research: {
      read: async () => ({
        url: 'https://example.org/article',
        text: 'Davor. Ein exakter Auszug. Danach.',
      }),
    },
    executeTool: async (name, args) => {
      executed.push(name);
      return {
        explanation: validateExplanation(args.explanation),
        results: [],
      };
    },
  });
  await agent.turn(
    { text: 'Bitte untersuchen' },
    { emit: (e) => events.push(e) },
  );
  assert.deepEqual(executed, ['present_explanation']);
  assert.ok(events.some((e) => e.type === 'explanation'));
  assert.equal(events.at(-1).text, 'Das ist der belegte Auszug.');
  assert.equal(requests[1].messages.at(-1).role, 'tool');
  await agent.turn(
    { text: 'Was war das?', conversationId: events[0].conversationId },
    { emit: () => {} },
  );
  assert.ok(
    requests.at(-1).messages.some((m) => m.content === 'Bitte untersuchen'),
  );
});

test('invented quotations and explicitly disabled windows are rejected before display actions', async () => {
  for (const visuals of [true, false]) {
    let executed = false,
      index = 0;
    const requests = [];
    const explanation = {
      title: 'Test',
      scenes: [
        {
          title: 'Zitat',
          narration: 'Fake',
          windows: [
            {
              kind: 'source',
              title: 'Fake',
              text: 'Erfunden',
              url: 'https://example.org',
            },
          ],
        },
      ],
    };
    const agent = createJarvis({
      env,
      executeTool: () => {
        executed = true;
      },
      fetchImpl: async (_url, opts) => {
        requests.push(JSON.parse(opts.body));
        return index++ === 0
          ? reply({
              tool_calls: [
                call('present_explanation', { display_ids: [], explanation }),
              ],
            })
          : reply({ content: 'Kein Beleg vorhanden.' });
      },
    });
    await agent.turn({ text: 'Bitte erklären', visuals });
    assert.equal(executed, false);
    assert.ok(JSON.parse(requests[1].messages.at(-1).content).error);
  }
});

test('abort prevents subsequent tool execution and retries are not blocked by a stale lock', async () => {
  const abort = new AbortController();
  let executed = 0;
  const agent = createJarvis({
    env,
    executeTool: () => executed++,
    fetchImpl: async () => {
      abort.abort();
      return reply({ tool_calls: [call('list_displays', {})] });
    },
  });
  await assert.rejects(() =>
    agent.turn({ text: 'Abbrechen' }, { signal: abort.signal }),
  );
  assert.equal(executed, 0);
  await assert.rejects(() =>
    agent.turn({ text: 'Noch einmal' }, { signal: abort.signal }),
  );
});

test('gateway errors do not copy upstream credential-bearing response bodies', async () => {
  const agent = createJarvis({
    env,
    fetchImpl: async () =>
      new Response('secret upstream body', { status: 401 }),
  });
  await assert.rejects(
    () => agent.turn({ text: 'Hallo' }),
    (error) =>
      /HTTP 401/.test(error.message) && !error.message.includes('secret'),
  );
});

test('structured explanations refuse unsafe links, too many windows and empty content', () => {
  assert.equal(validateExplanation(CONVERSATION_DEMO).scenes.length, 3);
  const make = (win) => ({
    title: 'Test',
    scenes: [{ title: 'Szene', narration: 'Text', windows: [win] }],
  });
  assert.throws(() =>
    validateExplanation(
      make({
        kind: 'source',
        title: 'X',
        text: 'X',
        url: 'javascript:alert(1)',
      }),
    ),
  );
  assert.throws(() =>
    validateExplanation(make({ kind: 'html', title: 'X', text: '<script/>' })),
  );
  assert.throws(() => validateExplanation({ title: 'T', scenes: [] }));
  const value = validateExplanation(
    make({
      kind: 'source',
      title: 'X',
      text: 'Original',
      url: 'https://example.org',
      highlight: 'invented',
    }),
  );
  assert.equal(value.scenes[0].windows[0].highlight, '');
  assert.match(value.scenes[0].windows[0].attribution, /prüfen/);
});

test('text chat cannot present or control windows without an explicit request, even with visuals:true', async () => {
  for (const name of ['present_explanation', 'control_explanation']) {
    let executed = 0,
      step = 0;
    const requests = [];
    const agent = createJarvis({
      env,
      executeTool: () => {
        executed++;
        return { explanation: CONVERSATION_DEMO, results: [] };
      },
      fetchImpl: async (_url, opts) => {
        requests.push(JSON.parse(opts.body));
        return reply(
          step++ === 0
            ? {
                tool_calls: [
                  call(name, {
                    display_ids: [],
                    command: 'next',
                    explanation: CONVERSATION_DEMO,
                  }),
                ],
              }
            : { content: 'Antwort im Chat.' },
        );
      },
    });
    const events = [];
    await agent.turn(
      { text: 'Untersuche das Thema', mode: 'chat', visuals: true },
      { emit: (e) => events.push(e) },
    );
    assert.equal(executed, 0);
    assert.ok(JSON.parse(requests[1].messages.at(-1).content).error);
    assert.equal(
      events.some((e) => ['explanation', 'control'].includes(e.type)),
      false,
    );
  }
});

test('presentation policy separates voice, explicit visual chat and negated requests', async () => {
  const { allowsPresentation } =
    await import('../../public/stark/presentation-policy.js');
  for (const text of ['Erklär mir Motoren', 'Untersuche das Beispiel']) {
    assert.equal(allowsPresentation({ mode: 'voice', text }), true);
    assert.equal(allowsPresentation({ mode: 'chat', text }), false);
  }
  for (const text of [
    'Zeig mir die Quellen',
    'Zeichne das bitte',
    'Erklär das visuell',
    'show me a diagram',
  ])
    assert.equal(allowsPresentation({ mode: 'chat', text }), true);
  for (const mode of ['chat', 'voice']) {
    for (const text of [
      'Zeig mir das ohne Fenster',
      'Bitte keine Grafiken',
      'nicht zeichnen',
      'nur im Chat antworten',
    ])
      assert.equal(allowsPresentation({ mode, text }), false);
    assert.equal(
      allowsPresentation({ mode, text: 'Zeig mir das', visuals: false }),
      false,
    );
  }
});
