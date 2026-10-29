import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MediaSourceStore,
  browseWebDav,
  fetchWebDavFile,
  smbTarget,
  sourceUrl,
} from './media-source-store.js';

test('NAS credentials are encrypted at rest and never returned by list', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stark-media-'));
  try {
    const store = new MediaSourceStore(directory);
    const publicSource = store.add({
      name: 'Office NAS',
      url: 'https://nas.example.test/dav',
      username: 'tony',
      password: 'arc-reactor',
    });
    assert.equal(publicSource.url, 'https://nas.example.test/dav/');
    assert.equal(publicSource.username, undefined);
    assert.equal(publicSource.password, undefined);
    const disk = readFileSync(
      path.join(directory, 'media-sources.json'),
      'utf8',
    );
    assert.doesNotMatch(disk, /tony|arc-reactor/);
    const reloaded = new MediaSourceStore(directory).get(publicSource.id);
    assert.deepEqual(reloaded.credentials, {
      username: 'tony',
      password: 'arc-reactor',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('WebDAV browsing and file loading keep credentials in authorization headers', async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    if (req.method === 'PROPFIND') {
      res.writeHead(207, { 'content-type': 'application/xml' });
      res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
        <d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
        <d:response><d:href>/dav/photos/</d:href><d:propstat><d:prop><d:displayname>Photos</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
        <d:response><d:href>/dav/iron.jpg</d:href><d:propstat><d:prop><d:displayname>iron.jpg</d:displayname><d:getcontentlength>3</d:getcontentlength><d:getcontenttype>image/jpeg</d:getcontenttype></d:prop></d:propstat></d:response>
      </d:multistatus>`);
      return;
    }
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.end('img');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const source = {
      url: `http://127.0.0.1:${server.address().port}/dav/`,
      credentials: { username: 'user', password: 'secret' },
    };
    const entries = await browseWebDav(source);
    assert.deepEqual(
      entries.map(({ name, directory }) => ({ name, directory })),
      [
        { name: 'Photos', directory: true },
        { name: 'iron.jpg', directory: false },
      ],
    );
    const response = await fetchWebDavFile(source, 'iron.jpg');
    assert.equal(await response.text(), 'img');
    assert.equal(requests.length, 2);
    assert.ok(
      requests.every(
        (request) => request.authorization === 'Basic dXNlcjpzZWNyZXQ=',
      ),
    );
    assert.ok(requests.every((request) => !request.url.includes('secret')));
    assert.throws(() => sourceUrl(source, '../private'), /außerhalb/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('SMB sources keep their address inside the configured share', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stark-smb-'));
  try {
    const store = new MediaSourceStore(directory);
    const added = store.add({
      type: 'smb',
      name: 'NAS Wohnzimmer',
      url: 'smb://nas.local/Fotos/Urlaub',
      username: String.raw`WORKGROUP\mt`,
      password: 'klartext-passwort',
    });
    assert.equal(added.type, 'smb');
    assert.equal(added.url, 'smb://nas.local/Fotos/Urlaub/');
    assert.equal(added.password, undefined);
    assert.equal(added.secret, undefined);

    const source = store.get(added.id);
    const target = smbTarget(source, 'Sommer/bild.jpg');
    assert.equal(target.host, 'nas.local');
    assert.equal(target.port, 445);
    assert.equal(target.domain, 'WORKGROUP');
    assert.equal(target.username, 'mt');
    assert.equal(target.path, 'Fotos/Urlaub/Sommer/bild.jpg');

    for (const escape of [
      '../../etc/passwd',
      String.raw`..\..\windows`,
      'Sommer/../../../root',
      'C:/Windows',
    ])
      assert.throws(
        () => smbTarget(source, escape),
        (error) => error.status === 400,
        `escape accepted: ${escape}`,
      );

    const stored = JSON.parse(
      readFileSync(path.join(directory, 'media-sources.json'), 'utf8'),
    );
    assert.ok(!JSON.stringify(stored).includes('klartext-passwort'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('SMB addresses without a share or with inline credentials are refused', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stark-smb-'));
  try {
    const store = new MediaSourceStore(directory);
    for (const url of [
      'smb://nas.local/',
      'smb://user:pw@nas.local/Fotos/',
      'https://nas.local/Fotos/',
    ])
      assert.throws(
        () => store.add({ type: 'smb', name: 'NAS', url }),
        (error) => error.status === 400,
        `address accepted: ${url}`,
      );
    assert.throws(
      () => store.add({ type: 'nfs', name: 'NAS', url: 'smb://nas/Fotos/' }),
      (error) => error.status === 400,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
