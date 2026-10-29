/**
 * Narrows down an SMB problem against a real share.
 *
 * Runs the same steps the media browser takes, one at a time, and reports
 * where it stops. Credentials are read from the command line and are never
 * written to a file or sent anywhere.
 *
 *   node scripts/smb-diagnose.mjs <host> <share> [folder] <user> <password>
 *
 * Example:
 *   node scripts/smb-diagnose.mjs 192.168.1.240 Media Bilder mt geheim
 */

import { Client } from 'smb3-client';

const [host, share, ...rest] = process.argv.slice(2);
const folder = rest.length > 2 ? rest.shift() : '';
const [username, password] = rest;

if (!host || !share || !username || password === undefined) {
  console.error(
    'Aufruf: node scripts/smb-diagnose.mjs <host> <freigabe> [ordner] <benutzer> <passwort>',
  );
  process.exit(2);
}

const account = String(username);
const separator = account.search(/[\\/]/);
const options = {
  host,
  domain: separator > 0 ? account.slice(0, separator) : '',
  username: separator > 0 ? account.slice(separator + 1) : account,
  password,
  connectTimeout: 10_000,
  requestTimeout: 30_000,
};

console.log(
  `Host ${host} · Freigabe ${share} · Ordner ${folder || '(keiner)'} · Domäne ${options.domain || '(keine)'} · Benutzer ${options.username}`,
);

function describe(error) {
  const name = error?.name || 'Error';
  const status = error?.statusName
    ? `${error.statusName} (0x${Number(error.status).toString(16)})`
    : '';
  return [name, status, error?.message].filter(Boolean).join(' | ');
}

async function step(label, run) {
  process.stdout.write(`${label.padEnd(46)}`);
  try {
    const result = await run();
    console.log('OK', result ?? '');
    return true;
  } catch (error) {
    console.log('FEHLER:', describe(error));
    return false;
  }
}

const client = new Client(options);
let connected = false;
try {
  connected = await step('1. Verbinden und anmelden', async () => {
    await client.connect();
    return '';
  });
  if (!connected) process.exit(1);

  await step(`2. Freigabe auflisten: "${share}"`, async () => {
    const entries = await client.readdir(share, { withFileTypes: true });
    return `${entries.length} Einträge, davon Ordner: ${entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .slice(0, 6)
      .join(', ')}`;
  });

  if (folder) {
    const nested = `${share}/${folder}`;
    await step(`3. Ordner auflisten: "${nested}"`, async () => {
      const entries = await client.readdir(nested, { withFileTypes: true });
      return `${entries.length} Einträge, erste: ${entries
        .slice(0, 5)
        .map((entry) => entry.name)
        .join(', ')}`;
    });

    await step(`4. Ordner-Eigenschaften: "${nested}"`, async () => {
      const info = await client.stat(nested);
      return `Ordner=${info.isDirectory} Größe=${info.size}`;
    });
  }
} finally {
  if (connected)
    try {
      await client.close();
    } catch {
      /* Verbindung ist schon beendet. */
    }
}
