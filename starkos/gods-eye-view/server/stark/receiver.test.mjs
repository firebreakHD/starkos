import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import { DisplayStore } from './display-store.js';
import { createDisplayService } from './receiver.js';
import { RECEIVER_CAPABILITIES } from './protocol.js';

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'stark-display-'));
  const store = new DisplayStore(directory);
  const service = createDisplayService({ store });
  const sent = new Map();
  for (const id of ['alpha', 'beta']) {
    store.addDevice({
      id,
      name: `Display ${id}`,
      token: `token-${id}`,
      capabilities: RECEIVER_CAPABILITIES,
    });
    const messages = [];
    service.sockets.set(id, {
      readyState: WebSocket.OPEN,
      send: (value) => messages.push(JSON.parse(value)),
    });
    sent.set(id, messages);
  }
  return { directory, store, service, sent };
}

test('two displays receive independent media sessions', () => {
  const value = fixture();
  try {
    const first = value.service.sendCommand(['alpha'], 'media.show', {
      media: {
        title: 'Alpha',
        type: 'image/png',
        data: 'data:image/png;base64,AA==',
      },
      mode: 'show',
    });
    const second = value.service.sendCommand(['beta'], 'media.show', {
      media: {
        title: 'Beta',
        type: 'text/uri-list',
        data: 'https://example.com/',
      },
      mode: 'show',
    });
    assert.notEqual(first.sessionId, second.sessionId);
    assert.equal(
      value.sent.get('alpha').at(-1).command.payload.media.title,
      'Alpha',
    );
    assert.equal(
      value.sent.get('beta').at(-1).command.payload.media.title,
      'Beta',
    );
    assert.equal(value.store.get('alpha').state.current.title, 'Alpha');
    assert.equal(value.store.get('beta').state.current.title, 'Beta');
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test('device tokens persist only as hashes and can be revoked', () => {
  const value = fixture();
  try {
    assert.ok(value.store.authenticate('alpha', 'token-alpha'));
    assert.equal(value.store.authenticate('alpha', 'wrong-token'), null);
    assert.equal(value.store.get('alpha').token, undefined);
    value.store.revoke('alpha');
    assert.equal(value.store.authenticate('alpha', 'token-alpha'), null);
    const reloaded = new DisplayStore(value.directory);
    assert.equal(reloaded.get('alpha'), null);
    assert.ok(reloaded.authenticate('beta', 'token-beta'));
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test('expired media grants cannot be moved and end_session returns standby', () => {
  const value = fixture();
  try {
    const shown = value.service.sendCommand(['alpha'], 'media.show', {
      media: {
        title: 'Evidence',
        type: 'image/png',
        data: 'data:image/png;base64,AA==',
      },
      mode: 'show',
    });
    value.service.sessions.get(shown.sessionId).expiresAt = Date.now() - 1;
    assert.throws(
      () =>
        value.service.executeTool('move_content', {
          source_display_id: 'alpha',
          target_display_ids: ['beta'],
          session_id: shown.sessionId,
        }),
      /abgelaufen/,
    );
    value.service.executeTool('end_session', {
      display_ids: ['alpha'],
      session_id: shown.sessionId,
    });
    assert.equal(value.store.get('alpha').state.status, 'standby');
    assert.equal(value.store.get('alpha').state.current, null);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test('capabilities refuse unsupported commands instead of pretending success', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stark-display-'));
  try {
    const store = new DisplayStore(directory);
    const service = createDisplayService({ store });
    store.addDevice({
      id: 'limited',
      name: 'Limited',
      token: 'secret',
      capabilities: ['media.image'],
    });
    service.sockets.set('limited', { readyState: WebSocket.OPEN, send() {} });
    const result = service.sendCommand(['limited'], 'playback.pause', {});
    assert.equal(result.results[0].accepted, false);
    assert.match(result.results[0].error, /playback.pause/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
