import assert from 'node:assert/strict';
import test from 'node:test';
import { addonEntryRedirect, addonEntryUrl, starkAuthPlugin } from './auth.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('Jarvis and tool endpoints remain controller-only in the Home Assistant add-on', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stark-auth-'));
  const previous = { ...process.env };
  try {
    process.env.STARK_ADDON = 'true';
    process.env.STARK_ACCESS_PASSWORD = '';
    process.env.STARK_DATA_DIR = directory;
    const middleware = [];
    starkAuthPlugin().configureServer({
      middlewares: { use: (fn) => middleware.push(fn) },
    });
    for (const url of [
      '/api/stark/jarvis/status',
      '/api/stark/jarvis/turn',
      '/api/stark/tools',
    ]) {
      let next = false,
        payload;
      const res = {
        setHeader() {},
        end(value) {
          payload = JSON.parse(value);
        },
      };
      await middleware[0](
        {
          url,
          method: url.endsWith('status') ? 'GET' : 'POST',
          headers: {},
          socket: { remoteAddress: '192.168.1.10' },
        },
        res,
        () => {
          next = true;
        },
      );
      assert.equal(next, false);
      assert.equal(res.statusCode, 401);
      assert.match(payload.error, /Home Assistant/);
    }
    let next = false;
    await middleware[0](
      {
        url: '/stark/explanation-player.js',
        method: 'GET',
        headers: {},
        socket: { remoteAddress: '192.168.1.10' },
      },
      {},
      () => {
        next = true;
      },
    );
    assert.equal(
      next,
      true,
      'a passive receiver can load its data-only renderer',
    );
  } finally {
    for (const key of [
      'STARK_ADDON',
      'STARK_ACCESS_PASSWORD',
      'STARK_DATA_DIR',
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Home Assistant add-on enters STARK OS and opens WORLD explicitly', () => {
  assert.equal(addonEntryRedirect('/', true), './stark/');
  assert.equal(addonEntryRedirect('/?ingress=1', true), './stark/');
  assert.equal(addonEntryRedirect('/?world=1', true), null);
  assert.equal(
    addonEntryUrl('/?world=1&embed=1', true),
    '/index.html?world=1&embed=1',
  );
  assert.equal(addonEntryUrl('/world?embed=1', true), '/index.html?embed=1');
  assert.equal(addonEntryUrl('/stark/', true), '/stark/');
});

test("standalone development keeps the original God's Eye root", () => {
  assert.equal(addonEntryUrl('/?embed=1', false), '/?embed=1');
});
