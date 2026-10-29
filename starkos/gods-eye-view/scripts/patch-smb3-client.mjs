/**
 * smb3-client 0.2.0 sends two SMB2 requests that Windows tolerates and Samba —
 * what Synology, QNAP and OpenMediaVault run — refuses. Both make NAS shares
 * unusable, so this script repairs the installed dependency during install.
 *
 * 1. NEGOTIATE carries padding after the last negotiate context, which makes
 *    the message longer than the context list it declares. MS-SMB2 §2.2.3
 *    aligns the start of each context, so padding belongs between contexts and
 *    not after the last one. Samba validates the length and answers the whole
 *    negotiation with STATUS_INVALID_PARAMETER, before authentication.
 *    Measured against a Samba NAS: the unchanged 112-byte request is refused,
 *    the same request truncated to 108 bytes negotiates dialect 0x311.
 *
 * 2. QUERY_DIRECTORY sends an empty search pattern when it pages through a
 *    large directory, but still reports FileNameOffset 96. MS-SMB2 §2.2.33
 *    requires that offset to be 0 when no pattern is supplied. Samba answers
 *    STATUS_OBJECT_NAME_INVALID, so listing stops at the first page.
 *
 * The script runs from `postinstall`, is idempotent, and fails loudly when a
 * file does not look as expected — that means the pinned version moved and the
 * patches have to be re-checked rather than silently skipped.
 *
 * Remove this script once the fixes are released upstream.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_VERSION = '0.2.0';
const MARKER = '/* STARK:';

const PATCHES = [
  {
    label: 'trailing negotiate padding',
    file: 'dist/wire/structs/negotiate.js',
    find: `        ctx.padTo(8);
        return Buffer.concat([buf, ctx.buffer()]);`,
    replace: `        ${MARKER} trailing negotiate padding removed */
        return Buffer.concat([buf, ctx.buffer()]);`,
  },
  {
    label: 'FileNameOffset without a search pattern',
    file: 'dist/wire/structs/queryDirectory.js',
    find: `    w.u16(64 + 32); // FileNameOffset
    w.u16(pat.length);`,
    replace: `    ${MARKER} FileNameOffset must be 0 without a search pattern */
    w.u16(pat.length === 0 ? 0 : 64 + 32); // FileNameOffset
    w.u16(pat.length);`,
  },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules', 'smb3-client');

function fail(message) {
  console.error(`patch-smb3-client: ${message}`);
  process.exit(1);
}

if (!existsSync(packageRoot)) {
  // Nothing installed to patch, for example a production install without the
  // media-source stack. Leave the tree untouched.
  console.log('patch-smb3-client: smb3-client not installed, nothing to do.');
  process.exit(0);
}

const version = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
).version;
if (version !== EXPECTED_VERSION)
  fail(
    `expected smb3-client ${EXPECTED_VERSION} but found ${version}. Re-check both SMB2 requests before changing the pin.`,
  );

let applied = 0;
let already = 0;
for (const patch of PATCHES) {
  const file = path.join(packageRoot, patch.file);
  if (!existsSync(file)) fail(`${patch.file} is missing from the dependency.`);
  const source = readFileSync(file, 'utf8');
  if (source.includes(patch.replace)) {
    already += 1;
    continue;
  }
  if (!source.includes(patch.find))
    fail(
      `could not find the ${patch.label} in ${patch.file}. The dependency changed; verify the SMB requests before shipping.`,
    );
  writeFileSync(file, source.replace(patch.find, patch.replace));
  applied += 1;
}

console.log(
  `patch-smb3-client: ${applied} patch(es) applied, ${already} already in place.`,
);
