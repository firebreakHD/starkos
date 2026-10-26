#!/usr/bin/env node
// Live QA for the STARK display protocol. Creates two explicitly named QA
// receivers, verifies independent commands and unauthorized rejection, then
// revokes both devices so the operator's display list stays clean.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173/');

async function request(path, options = {}) {
  const response = await fetch(new URL(path, base), options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${body.error || ''}`);
  return body;
}

async function pairedDevice(name) {
  const claim = await request('/api/stark/receiver/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      suggestedName: 'DISCOVERED QA DISPLAY',
      capabilities: [
        'media.image',
        'media.web',
        'playback.pause',
        'image.transform',
        'file.transfer',
      ],
    }),
  });
  const pending = await request('/api/stark/pairing/pending');
  assert.ok(pending.some((item) => item.id === claim.claimId));
  await request(`/api/stark/pairing/${claim.claimId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const status = await request('/api/stark/receiver/claim-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(claim),
  });
  assert.equal(status.status, 'approved');
  return status.device;
}

function connect(device) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/stark/ws', base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    const commands = [];
    socket.once('error', reject);
    socket.on('open', () =>
      socket.send(
        JSON.stringify({
          v: 1,
          protocol: 'stark-display/1',
          type: 'receiver.auth',
          deviceId: device.id,
          token: device.token,
        }),
      ),
    );
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'receiver.ready') resolve({ socket, commands });
      if (message.type === 'command') commands.push(message.command);
    });
  });
}

async function unauthorized(device) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/stark/ws', base);
    url.protocol = 'ws:';
    const socket = new WebSocket(url);
    socket.on('open', () =>
      socket.send(
        JSON.stringify({
          v: 1,
          protocol: 'stark-display/1',
          type: 'receiver.auth',
          deviceId: device.id,
          token: 'wrong-token',
        }),
      ),
    );
    socket.on('close', (code) => resolve(code));
    socket.on('error', reject);
  });
}

const devices = [];
try {
  devices.push(
    await pairedDevice('DEMO QA DISPLAY A'),
    await pairedDevice('DEMO QA DISPLAY B'),
  );
  const [alpha, beta] = await Promise.all(devices.map(connect));
  await request('/api/stark/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'show_media',
      arguments: {
        display_ids: [devices[0].id],
        media: {
          title: 'ALPHA',
          type: 'image/png',
          data: 'data:image/png;base64,AA==',
        },
      },
    }),
  });
  await request('/api/stark/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'show_media',
      arguments: {
        display_ids: [devices[1].id],
        media: {
          title: 'BETA',
          type: 'text/uri-list',
          data: 'https://example.com/',
        },
      },
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(alpha.commands.at(-1).payload.media.title, 'ALPHA');
  assert.equal(beta.commands.at(-1).payload.media.title, 'BETA');
  assert.equal(await unauthorized(devices[0]), 4403);
  await request('/api/stark/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'end_session',
      arguments: { display_ids: devices.map((device) => device.id) },
    }),
  });
  alpha.socket.close();
  beta.socket.close();
  console.log(
    'STARK display QA passed: two receivers, independent content, unauthorized token rejection, end_session.',
  );
} finally {
  for (const device of devices)
    await request(`/api/stark/receivers/${device.id}`, {
      method: 'DELETE',
    }).catch(() => {});
}
