/**
 * Narrows down an SMB problem against a real share, using exactly the code
 * path the media browser takes.
 *
 *   node scripts/smb-diagnose.mjs <host> <share> [folder] <user> <password>
 *
 * Example:
 *   node scripts/smb-diagnose.mjs 192.168.1.240 Media Bilder mt geheim
 *
 * The password is read from the command line and is neither stored nor sent
 * anywhere. Set STARK_SMB_PYTHON if the Python interpreter is not `python3`.
 */

import { browseSmb, readSmbFile } from '../server/stark/media-source-store.js';

const [host, share, ...rest] = process.argv.slice(2);
const folder = rest.length > 2 ? rest.shift() : '';
const [username, password] = rest;

if (!host || !share || !username || password === undefined) {
  console.error(
    'Aufruf: node scripts/smb-diagnose.mjs <host> <freigabe> [ordner] <benutzer> <passwort>',
  );
  process.exit(2);
}

const source = {
  type: 'smb',
  url: `smb://${host}/${[share, folder].filter(Boolean).join('/')}/`,
  credentials: { username, password },
};

console.log(
  `Adresse ${source.url} · Benutzer ${username}${username.includes('\\') ? ' (mit Domäne)' : ''}`,
);

async function step(label, run) {
  process.stdout.write(`${label.padEnd(44)}`);
  try {
    console.log('OK', (await run()) ?? '');
    return true;
  } catch (error) {
    console.log(`FEHLER (HTTP ${error.status || '?'}): ${error.message}`);
    return false;
  }
}

const listed = [];
await step('1. Konfigurierten Ordner auflisten', async () => {
  const entries = await browseSmb(source, '');
  listed.push(...entries);
  const folders = entries.filter((entry) => entry.directory).length;
  return `${entries.length} Einträge (${folders} Ordner, ${entries.length - folders} Dateien)`;
});

const firstFolder = listed.find((entry) => entry.directory);
if (firstFolder)
  await step(`2. Unterordner auflisten: "${firstFolder.name}"`, async () => {
    const entries = await browseSmb(source, firstFolder.path);
    return `${entries.length} Einträge`;
  });

const firstFile = listed.find((entry) => !entry.directory);
if (firstFile)
  await step(`3. Datei lesen: "${firstFile.name}"`, async () => {
    const content = await readSmbFile(source, firstFile.path, 20 * 1024 * 1024);
    return `${content.length} Byte`;
  });

if (listed.length)
  console.log(
    'Erste Einträge:',
    listed
      .slice(0, 8)
      .map((entry) => (entry.directory ? `${entry.name}/` : entry.name))
      .join(', '),
  );
