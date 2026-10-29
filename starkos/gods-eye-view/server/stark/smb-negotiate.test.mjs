// Guards the patched SMB negotiate request. smb3-client 0.2.0 appends padding
// after the last negotiate context; Samba answers such a message with
// STATUS_INVALID_PARAMETER, which makes every NAS share unreachable. The
// postinstall patch removes it, and this test fails if an install or a version
// bump brings the padding back.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const encoderFile = path.join(
  root,
  'node_modules/smb3-client/dist/wire/structs/negotiate.js',
);

const DIALECTS = [0x0202, 0x0210, 0x0300, 0x0302, 0x0311];
const PREAUTH_CONTEXT = 0x0001;
const align8 = (value) => value + ((8 - (value % 8)) % 8);

test('the SMB negotiate request carries no padding after the last context', async (t) => {
  if (!existsSync(encoderFile)) {
    t.skip('smb3-client is not installed');
    return;
  }
  const version = JSON.parse(
    readFileSync(
      path.join(root, 'node_modules/smb3-client/package.json'),
      'utf8',
    ),
  ).version;
  assert.equal(
    version,
    '0.2.0',
    'the pin moved: re-check the negotiate padding patch',
  );

  const { encodeNegotiateRequest } = await import(
    pathToFileURL(encoderFile).href
  );
  const body = encodeNegotiateRequest({
    dialects: DIALECTS,
    clientGuid: randomBytes(16),
    capabilities: 0x44,
    securityMode: 1,
    preauthSalt: randomBytes(32),
    ciphers: [0x0002, 0x0001],
  });

  // Walk the context list and find where the last one ends.
  const contextStart = body.readUInt32LE(28) - 64;
  const contextCount = body.readUInt16LE(32);
  assert.equal(
    body.readUInt16LE(contextStart),
    PREAUTH_CONTEXT,
    'the first negotiate context should carry pre-auth integrity',
  );
  let offset = contextStart;
  for (let index = 0; index < contextCount; index += 1) {
    const dataLength = body.readUInt16LE(offset + 2);
    const end = offset + 8 + dataLength;
    offset = index === contextCount - 1 ? end : align8(end);
  }

  assert.equal(
    body.length,
    offset,
    `the request is ${body.length - offset} bytes longer than its contexts; Samba refuses that with STATUS_INVALID_PARAMETER`,
  );
});
