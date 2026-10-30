/**
 * SMB access for media sources.
 *
 * SMB is spoken by a small Python helper built on `smbprotocol`, the
 * maintained implementation that works against Samba servers — what Synology,
 * QNAP and OpenMediaVault run. The pure-JS client used before was refused by
 * those servers before authentication even started.
 *
 * The request travels as one JSON line on stdin, so the password never appears
 * in a command line, an environment variable or a log.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/smb-storage.py',
);
const MAX_HEADER = 64 * 1024;
const LIST_TIMEOUT = 30_000;
const FILE_TIMEOUT = 120_000;

function interpreter() {
  return (
    process.env.STARK_SMB_PYTHON ||
    (process.platform === 'win32' ? 'python' : 'python3')
  );
}

function failure(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

/**
 * Runs one helper command. Returns the parsed header and, for `get`, the file
 * bytes that follow it.
 */
function run(command, { collectBody = false, timeout = LIST_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(interpreter(), ['-u', HELPER], {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      reject(failure('SMB-Laufzeit fehlt: Python ist nicht verfügbar.', 501));
      return;
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(failure('Zeitüberschreitung bei der SMB-Anfrage.', 504));
    }, timeout);

    let header = null;
    let pending = Buffer.alloc(0);
    const body = [];
    let bodyLength = 0;
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    // The library writes diagnostics to stderr; drain them so they never reach
    // a log or a response.
    child.stderr.resume();

    child.stdout.on('data', (chunk) => {
      if (header) {
        if (!collectBody) return;
        bodyLength += chunk.length;
        body.push(chunk);
        return;
      }
      pending = Buffer.concat([pending, chunk]);
      const newline = pending.indexOf(0x0a);
      if (newline < 0) {
        if (pending.length > MAX_HEADER) {
          child.kill('SIGKILL');
          finish(failure('SMB-Antwort ist ungültig.'));
        }
        return;
      }
      const line = pending.subarray(0, newline).toString('utf8');
      const rest = pending.subarray(newline + 1);
      pending = Buffer.alloc(0);
      try {
        header = JSON.parse(line);
      } catch {
        child.kill('SIGKILL');
        finish(failure('SMB-Antwort ist ungültig.'));
        return;
      }
      if (!header.ok) {
        child.kill('SIGKILL');
        finish(
          failure(
            header.error || 'SMB-Zugriff fehlgeschlagen.',
            Number(header.status) || 502,
          ),
        );
        return;
      }
      if (collectBody && rest.length) {
        bodyLength += rest.length;
        body.push(rest);
      }
    });

    child.on('error', () =>
      finish(failure('SMB-Laufzeit fehlt: Python ist nicht verfügbar.', 501)),
    );

    child.on('close', (code) => {
      if (settled) return;
      if (!header) {
        finish(failure('SMB-Laufzeit lieferte keine Antwort.'));
        return;
      }
      if (code !== 0) {
        finish(failure('SMB-Übertragung wurde unterbrochen.'));
        return;
      }
      finish(null, {
        header,
        body: collectBody ? Buffer.concat(body, bodyLength) : null,
      });
    });

    child.stdin.on('error', () => {
      /* The helper closed early; `close` reports the real reason. */
    });
    child.stdin.end(`${JSON.stringify(command)}\n`);
  });
}

/** Lists one directory of a share. */
export async function listSmbDirectory(target, relativePath = '') {
  const { header } = await run({
    operation: 'list',
    config: describe(target),
    password: target.password,
    path: relativePath,
  });
  return Array.isArray(header.entries) ? header.entries : [];
}

/** Reads one file, refusing anything above `limit` bytes. */
export async function readSmbFileBytes(target, relativePath, limit) {
  const { header, body } = await run(
    {
      operation: 'get',
      config: describe(target),
      password: target.password,
      path: relativePath,
      maxBytes: limit,
    },
    { collectBody: true, timeout: FILE_TIMEOUT },
  );
  if (limit && body.length > limit)
    throw failure('NAS-Datei ist zu groß.', 413);
  if (Number.isInteger(header.length) && body.length !== header.length)
    throw failure('SMB-Übertragung war unvollständig.');
  return body;
}

function describe(target) {
  return {
    host: target.host,
    port: target.port,
    share: target.share,
    baseFolder: target.folder,
    username: target.username,
    domain: target.domain,
    encrypt: Boolean(target.encrypt),
  };
}
