import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createCodex,
  codexChildEnvironment,
  validateLoginUrl,
  validateCallback,
} from './codex.js';

const AUTH =
  'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback&state=fixture-state&code_challenge=fixture-pkce';
function fixture({
  account = null,
  delay = false,
  callbackDelayReads = 0,
  callbackFailure = false,
} = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'stark-codex-test-'));
  const sent = [];
  let options, args;
  let current = account;
  let delayedAccount = null,
    remainingReads = 0;
  const callbackRequests = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const emit = (message) =>
    child.stdout.emit('data', Buffer.from(JSON.stringify(message) + '\n'));
  child.stdin = {
    writable: true,
    write(line) {
      const message = JSON.parse(line);
      sent.push(message);
      if (message.id === undefined || !message.method) return;
      queueMicrotask(() => {
        let result = {};
        if (message.method === 'account/read') {
          if (remainingReads > 0) remainingReads--;
          else if (delayedAccount) {
            current = delayedAccount;
            delayedAccount = null;
          }
          result = { account: current, requiresOpenaiAuth: true };
        }
        if (message.method === 'account/login/start')
          result = { type: 'chatgpt', loginId: 'login-fixture', authUrl: AUTH };
        if (message.method === 'account/logout') current = null;
        if (message.method === 'thread/start')
          result = { thread: { id: 'thread-fixture' } };
        if (message.method === 'turn/start')
          result = { turn: { id: 'turn-fixture' } };
        emit({ id: message.id, result });
        if (message.method === 'turn/start' && !delay)
          queueMicrotask(() => {
            emit({
              method: 'item/completed',
              params: {
                threadId: 'thread-fixture',
                item: {
                  type: 'agentMessage',
                  text: JSON.stringify({
                    text: '',
                    calls: [{ name: 'list_displays', arguments: '{}' }],
                  }),
                },
              },
            });
            emit({
              method: 'turn/completed',
              params: {
                threadId: 'thread-fixture',
                turn: { status: 'completed' },
              },
            });
          });
      });
    },
  };
  child.kill = () => queueMicrotask(() => child.emit('exit', 0));
  const provider = createCodex({
    home: directory,
    env: {
      PATH: '/bin',
      HOME: directory,
      OPENAI_API_KEY: 'must-not-leak',
      STARK_HERMES_API_KEY: 'must-not-leak',
    },
    spawnImpl: (_exe, a, o) => {
      args = a;
      options = o;
      return child;
    },
    fetchImpl: async (url, opts) => {
      callbackRequests.push(url.href);
      assert.equal(url.origin, 'http://127.0.0.1:1455');
      assert.equal(opts.redirect, 'manual');
      if (callbackFailure)
        throw new Error('private upstream details must never reach the UI');
      emit({
        method: 'account/login/completed',
        params: { loginId: 'login-fixture', success: true },
      });
      const nextAccount = { type: 'chatgpt', email: 'test@example.invalid' };
      if (callbackDelayReads) {
        delayedAccount = nextAccount;
        remainingReads = callbackDelayReads;
      } else current = nextAccount;
      return new Response(null, {
        status: 302,
        headers: { location: 'https://chatgpt.com/' },
      });
    },
  });
  return {
    provider,
    sent,
    emit,
    callbackRequests,
    get options() {
      return options;
    },
    get args() {
      return args;
    },
    cleanup() {
      provider.dispose();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('normal browser login requests ONLY chatgpt, validates callback and never returns tokens', async () => {
  const f = fixture();
  try {
    assert.equal((await f.provider.status()).available, false);
    const login = await f.provider.beginLogin();
    assert.equal(login.authUrl, AUTH);
    await f.provider.beginLogin();
    assert.equal(
      f.sent.filter((x) => x.method === 'account/login/start').length,
      1,
    );
    const start = f.sent.find((x) => x.method === 'account/login/start');
    assert.deepEqual(start.params, {
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
    });
    assert.ok(f.args.includes('forced_login_method="chatgpt"'));
    assert.equal(f.options.env.OPENAI_API_KEY, undefined);
    assert.equal(f.options.env.STARK_HERMES_API_KEY, undefined);
    await assert.rejects(
      () =>
        f.provider.finishLogin(
          'http://127.0.0.1:1455/auth/callback?code=fixture&state=wrong',
        ),
      /Rückleitungsadresse/,
    );
    const result = await f.provider.finishLogin(
      'http://127.0.0.1:1455/auth/callback?code=fixture&state=fixture-state',
    );
    assert.equal(result.available, true);
    assert.doesNotMatch(
      JSON.stringify(result),
      /access_token|refresh_token|test@example/,
    );
    assert.equal((await f.provider.logout()).available, false);
    assert.ok(
      !f.sent.some((x) =>
        JSON.stringify(x.params).includes('chatgptDeviceCode'),
      ),
    );
  } finally {
    f.cleanup();
  }
});

test('browser return accepts copied localhost aliases but always forwards to the fixed IPv4 listener', async () => {
  for (const prefix of [
    'http://localhost:1455',
    'localhost:1455',
    '127.0.0.1:1455',
  ]) {
    const f = fixture();
    try {
      await f.provider.beginLogin();
      assert.equal((await f.provider.status()).loginPending, true);
      assert.ok((await f.provider.status()).loginExpiresAt > Date.now());
      await f.provider.finishLogin(
        ` ${prefix}/auth/callback?code=fixture&state=fixture-state `,
      );
      assert.equal(
        new URL(f.callbackRequests[0]).origin,
        'http://127.0.0.1:1455',
      );
      await f.provider.finishLogin('already consumed');
      assert.equal(
        f.callbackRequests.length,
        1,
        'successful retries must not exchange the one-use code again',
      );
    } finally {
      f.cleanup();
    }
  }
});

test('completion notification does not lose a pending login before account/read refreshes', async () => {
  const f = fixture({ callbackDelayReads: 3 });
  try {
    await f.provider.beginLogin();
    f.emit({
      method: 'account/login/completed',
      params: { loginId: 'login-fixture', success: true },
    });
    const pending = await f.provider.status();
    assert.equal(pending.available, false);
    assert.equal(pending.loginPending, true);
    const result = await f.provider.finishLogin(
      'http://127.0.0.1:1455/auth/callback?code=fixture&state=fixture-state',
    );
    assert.equal(result.available, true);
    assert.equal(f.callbackRequests.length, 1);
  } finally {
    f.cleanup();
  }
});

test('failed callback stays retryable and reports a safe actionable error', async () => {
  const f = fixture({ callbackFailure: true });
  try {
    await f.provider.beginLogin();
    await assert.rejects(
      () =>
        f.provider.finishLogin(
          'http://127.0.0.1:1455/auth/callback?code=fixture&state=fixture-state',
        ),
      (error) =>
        error.status === 502 &&
        /erneut einfügen/.test(error.message) &&
        !error.message.includes('private'),
    );
    assert.equal((await f.provider.status()).loginPending, true);
  } finally {
    f.cleanup();
  }
});

test('wrong link types, duplicate values and provider rejection give actionable validation errors', () => {
  const login = { ...validateLoginUrl(AUTH), expires: Date.now() + 60000 };
  assert.throws(
    () =>
      validateCallback(
        'https://auth.openai.com/oauth/authorize?state=fixture-state',
        login,
      ),
    (error) => error.status === 400,
  );
  assert.throws(
    () => validateCallback('not a URL', login),
    /vollständige Weiterleitungsadresse/,
  );
  assert.throws(() =>
    validateCallback(
      'http://127.0.0.1:1455/auth/callback?code=a&code=b&state=fixture-state',
      login,
    ),
  );
  assert.throws(
    () =>
      validateCallback(
        'http://127.0.0.1:1455/auth/callback?error=access_denied&state=fixture-state',
        login,
      ),
    /abgebrochen oder abgelehnt/,
  );
});

test('callback cannot fetch arbitrary hosts, ports, credentials, stale states or missing codes', () => {
  const parsed = validateLoginUrl(AUTH);
  const login = { ...parsed, expires: Date.now() + 60000 };
  for (const value of [
    'http://169.254.169.254/auth/callback?code=x&state=fixture-state',
    'http://127.0.0.1:9999/auth/callback?code=x&state=fixture-state',
    'http://user:pass@127.0.0.1:1455/auth/callback?code=x&state=fixture-state',
    'http://127.0.0.1:1455/auth/callback?state=fixture-state',
  ])
    assert.throws(() => validateCallback(value, login));
  assert.throws(() =>
    validateCallback(
      'http://127.0.0.1:1455/auth/callback?code=x&state=fixture-state',
      { ...login, expires: 0 },
    ),
  );
  assert.throws(() =>
    validateLoginUrl(AUTH.replace('auth.openai.com', 'example.org')),
  );
  assert.deepEqual(
    codexChildEnvironment(
      {
        HOME: '/test',
        CODEX_HOME: '/unrelated',
        OPENAI_API_KEY: 'secret',
        BROWSER: 'unsafe-command',
      },
      '/isolated',
    ),
    { HOME: '/test', CODEX_HOME: '/isolated' },
  );
});

test('Codex completion returns STARK tool requests with native tools disabled', async () => {
  const f = fixture({ account: { type: 'chatgpt' } });
  try {
    const result = await f.provider.completion({
      messages: [{ role: 'user', content: 'Liste Displays' }],
      tools: [],
    });
    assert.equal(result.tool_calls[0].function.name, 'list_displays');
    const thread = f.sent.find((x) => x.method === 'thread/start').params;
    assert.equal(thread.sandbox, 'read-only');
    assert.equal(thread.ephemeral, true);
    assert.equal(thread.config['features.shell_tool'], false);
    assert.equal(thread.config['features.multi_agent'], false);
    assert.ok(
      f.sent.find((x) => x.method === 'turn/start').params.outputSchema,
    );
    f.emit({
      id: 999,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'unsafe' },
    });
    assert.equal(f.sent.at(-1).error.code, -32601);
  } finally {
    f.cleanup();
  }
});

test('API-key accounts are not accepted as a ChatGPT browser login', async () => {
  const f = fixture({ account: { type: 'apiKey' } });
  try {
    assert.equal((await f.provider.status()).available, false);
    await assert.rejects(
      () => f.provider.completion({ messages: [], tools: [] }),
      /anmelden/,
    );
    assert.equal(
      f.sent.some((x) => x.method === 'turn/start'),
      false,
    );
  } finally {
    f.cleanup();
  }
});

test('Stop interrupts a running Codex turn', async () => {
  const f = fixture({ account: { type: 'chatgpt' }, delay: true });
  try {
    const abort = new AbortController();
    const promise = f.provider.completion({
      messages: [],
      tools: [],
      signal: abort.signal,
    });
    await new Promise((resolve) => setImmediate(resolve));
    abort.abort();
    await assert.rejects(promise, /Abgebrochen/);
    assert.ok(f.sent.some((x) => x.method === 'turn/interrupt'));
  } finally {
    f.cleanup();
  }
});
