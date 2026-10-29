/**
 * smb3-client 0.2.0 appends padding after the last SMB2 negotiate context.
 * MS-SMB2 aligns each context to an 8-byte boundary, but the list ends with
 * the last context; the extra bytes make the message longer than its parsed
 * contents. Windows ignores them. Samba — what Synology, QNAP and
 * OpenMediaVault run — validates the length and answers the whole NEGOTIATE
 * with STATUS_INVALID_PARAMETER, so every SMB share on such a NAS is
 * unreachable before authentication even starts.
 *
 * Measured against a Samba NAS: the unchanged 112-byte request is refused,
 * the identical request truncated to the end of the last context (108 bytes)
 * is accepted and negotiates dialect 0x311.
 *
 * This script removes that trailing padding in the installed dependency. It
 * runs from `postinstall`, is idempotent, and fails loudly when the file does
 * not look as expected — that means the pinned version moved and the patch
 * has to be re-checked rather than silently skipped.
 *
 * Remove this script once the fix is released upstream.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_VERSION = '0.2.0';
const MARKER = '/* STARK: trailing negotiate padding removed */';
const TARGET = [
  'node_modules',
  'smb3-client',
  'dist',
  'wire',
  'structs',
  'negotiate.js',
];
// The final padTo(8) before the contexts are concatenated onto the body.
const PADDING = `        ctx.padTo(8);
        return Buffer.concat([buf, ctx.buffer()]);`;
const REPLACEMENT = `        ${MARKER}
        return Buffer.concat([buf, ctx.buffer()]);`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, ...TARGET);
const manifest = path.join(root, 'node_modules', 'smb3-client', 'package.json');

function fail(message) {
  console.error(`patch-smb3-client: ${message}`);
  process.exit(1);
}

if (!existsSync(file)) {
  // Nothing installed to patch, for example a production install without the
  // optional media-source stack. Leave the tree untouched.
  console.log('patch-smb3-client: smb3-client not installed, nothing to do.');
  process.exit(0);
}

const version = JSON.parse(readFileSync(manifest, 'utf8')).version;
if (version !== EXPECTED_VERSION)
  fail(
    `expected smb3-client ${EXPECTED_VERSION} but found ${version}. Re-check whether the trailing negotiate padding is still present before changing the pin.`,
  );

const source = readFileSync(file, 'utf8');
if (source.includes(MARKER)) {
  console.log('patch-smb3-client: already applied.');
  process.exit(0);
}
if (!source.includes(PADDING))
  fail(
    'the trailing negotiate padding was not found. The dependency changed; verify the SMB negotiate request before shipping.',
  );

writeFileSync(file, source.replace(PADDING, REPLACEMENT));
console.log('patch-smb3-client: trailing negotiate padding removed.');
