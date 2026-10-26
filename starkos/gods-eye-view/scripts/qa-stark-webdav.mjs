#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const app = new URL(process.argv[2] || 'http://127.0.0.1:4173/api/stark/');
const authorization = 'Basic ' + Buffer.from('stark:secret').toString('base64');
const mock = createServer((req, res) => {
  if (req.headers.authorization !== authorization) {
    res.writeHead(401).end();
    return;
  }
  if (req.method === 'PROPFIND') {
    res.writeHead(207, { 'content-type': 'application/xml' });
    res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>/dav/demo.png</d:href><d:propstat><d:prop><d:displayname>demo.png</d:displayname><d:getcontentlength>8</d:getcontentlength><d:getcontenttype>image/png</d:getcontenttype></d:prop></d:propstat></d:response>
    </d:multistatus>`);
    return;
  }
  res.writeHead(200, { 'content-type': 'image/png' });
  res.end('PNG-DEMO');
});

await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
let source;
try {
  const request = async (path, options) => {
    const response = await fetch(new URL(path, app), options);
    const contentType = response.headers.get('content-type') || '';
    const value = contentType.includes('json')
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
    return value;
  };
  source = await request('media-sources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'QA NAS',
      type: 'webdav',
      url: `http://127.0.0.1:${mock.address().port}/dav/`,
      username: 'stark',
      password: 'secret',
    }),
  });
  assert.equal(source.username, undefined);
  assert.equal(source.password, undefined);
  assert.equal(
    (await request(`media-sources/${source.id}/test`, { method: 'POST' }))
      .connected,
    true,
  );
  source = await request(`media-sources/${source.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'QA NAS UPDATED' }),
  });
  assert.equal(source.name, 'QA NAS UPDATED');
  assert.equal(
    (await request(`media-sources/${source.id}/test`, { method: 'POST' }))
      .connected,
    true,
  );
  const entries = await request(`media-sources/${source.id}/browse`);
  assert.equal(entries[0].name, 'demo.png');
  assert.equal(entries[0].type, 'image/png');
  const file = await request(`media-sources/${source.id}/file?path=demo.png`);
  assert.equal(file.toString(), 'PNG-DEMO');
  const listed = await request('media-sources');
  assert.equal(
    listed.some((entry) => entry.id === source.id),
    true,
  );
  console.log(
    'STARK WebDAV QA passed: encrypted source, test, browse and file proxy.',
  );
} finally {
  if (source)
    await fetch(new URL(`media-sources/${source.id}`, app), {
      method: 'DELETE',
    });
  await new Promise((resolve) => mock.close(resolve));
}
