import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SOURCE_TYPES = ['webdav', 'smb'];

function cleanUrl(value, type = 'webdav') {
  if (type === 'smb') return cleanSmbUrl(value);
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol))
    throw Object.assign(
      new Error('Nur HTTP(S)-WebDAV-Adressen sind erlaubt.'),
      {
        status: 400,
      },
    );
  if (url.username || url.password || url.search || url.hash)
    throw Object.assign(
      new Error(
        'Zugangsdaten und Tokens gehören in die separaten Felder, nicht in die URL.',
      ),
      { status: 400 },
    );
  url.username = '';
  url.password = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** `smb://host[:port]/Freigabe[/Unterordner]/` ohne Zugangsdaten in der URL. */
function cleanSmbUrl(value) {
  const raw = String(value || '')
    .trim()
    .replace(/\\/g, '/');
  // Nur eine Adresse ganz ohne Schema wird zu smb:// ergänzt; ein fremdes
  // Schema darf nicht als Hostname durchrutschen.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw);
  if (scheme && scheme[1].toLowerCase() !== 'smb')
    throw Object.assign(
      new Error('Für SMB wird eine smb://-Adresse erwartet.'),
      { status: 400 },
    );
  const url = new URL(scheme ? raw : `smb://${raw.replace(/^\/+/, '')}`);
  if (url.protocol !== 'smb:')
    throw Object.assign(
      new Error('Für SMB wird eine smb://-Adresse erwartet.'),
      { status: 400 },
    );
  if (!url.hostname)
    throw Object.assign(new Error('Adresse der SMB-Freigabe fehlt.'), {
      status: 400,
    });
  if (url.username || url.password || url.search || url.hash)
    throw Object.assign(
      new Error(
        'Zugangsdaten und Tokens gehören in die separaten Felder, nicht in die URL.',
      ),
      { status: 400 },
    );
  const segments = url.pathname.split('/').filter(Boolean);
  if (!segments.length)
    throw Object.assign(
      new Error(
        'Die Adresse muss die Freigabe enthalten, zum Beispiel smb://nas/Fotos/.',
      ),
      { status: 400 },
    );
  if (segments.some((part) => decodeURIComponent(part) === '..'))
    throw Object.assign(new Error('Ungültiger Freigabepfad.'), { status: 400 });
  url.username = '';
  url.password = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

export class MediaSourceStore {
  constructor(
    dataDir = process.env.STARK_DATA_DIR || path.resolve('.stark-data'),
  ) {
    this.file = path.join(dataDir, 'media-sources.json');
    this.keyFile = path.join(dataDir, 'media-sources.key');
    mkdirSync(dataDir, { recursive: true });
    this.key = this.#loadKey();
    this.data = { version: 1, sources: [] };
    try {
      const loaded = JSON.parse(readFileSync(this.file, 'utf8'));
      if (loaded?.version === 1 && Array.isArray(loaded.sources))
        this.data = loaded;
    } catch {
      /* first start */
    }
  }

  #loadKey() {
    try {
      const key = readFileSync(this.keyFile);
      if (key.length === 32) return key;
    } catch {
      /* first start */
    }
    const key = randomBytes(32);
    writeFileSync(this.keyFile, key, { mode: 0o600 });
    return key;
  }

  #seal(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: ciphertext.toString('base64'),
    };
  }

  #open(sealed) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(sealed.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(sealed.data, 'base64')),
        decipher.final(),
      ]).toString('utf8'),
    );
  }

  #save() {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data, null, 2), {
      mode: 0o600,
    });
    renameSync(temporary, this.file);
  }

  list() {
    return this.data.sources.map(({ secret: _secret, ...source }) => ({
      ...source,
      hasCredentials: true,
    }));
  }

  get(id) {
    const source = this.data.sources.find((entry) => entry.id === id);
    if (!source) return null;
    return { ...source, credentials: this.#open(source.secret) };
  }

  add(input) {
    const type = SOURCE_TYPES.includes(input.type) ? input.type : 'webdav';
    const source = {
      id: randomUUID(),
      name: String(input.name || '')
        .trim()
        .slice(0, 80),
      type,
      url: cleanUrl(input.url, type),
      secret: this.#seal({
        username: String(input.username || ''),
        password: String(input.password || ''),
      }),
      createdAt: new Date().toISOString(),
    };
    if (!source.name)
      throw Object.assign(new Error('Name der Medienquelle fehlt.'), {
        status: 400,
      });
    this.data.sources.push(source);
    this.#save();
    return this.list().find((entry) => entry.id === source.id);
  }

  update(id, input) {
    const source = this.data.sources.find((entry) => entry.id === id);
    if (!source) return null;
    if (input.name !== undefined) {
      const name = String(input.name).trim().slice(0, 80);
      if (!name)
        throw Object.assign(new Error('Name der Medienquelle fehlt.'), {
          status: 400,
        });
      source.name = name;
    }
    if (input.type !== undefined && SOURCE_TYPES.includes(input.type))
      source.type = input.type;
    if (input.url !== undefined)
      source.url = cleanUrl(input.url, source.type || 'webdav');
    if (input.username !== undefined || input.password !== undefined) {
      const current = this.#open(source.secret);
      source.secret = this.#seal({
        username:
          input.username === undefined
            ? current.username
            : String(input.username),
        password:
          input.password === undefined
            ? current.password
            : String(input.password),
      });
    }
    this.#save();
    return this.list().find((entry) => entry.id === id);
  }

  remove(id) {
    const index = this.data.sources.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    this.data.sources.splice(index, 1);
    this.#save();
    return true;
  }
}

function authorization(credentials) {
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
}

function unescapeXml(value) {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export function sourceUrl(source, relativePath = '') {
  const base = new URL(source.url);
  const value = new URL(String(relativePath || '').replace(/^\/+/, ''), base);
  if (value.origin !== base.origin || !value.pathname.startsWith(base.pathname))
    throw Object.assign(new Error('Pfad liegt außerhalb der Medienquelle.'), {
      status: 400,
    });
  return value;
}

export async function browseWebDav(source, relativePath = '') {
  const target = sourceUrl(source, relativePath);
  const response = await fetch(target, {
    method: 'PROPFIND',
    headers: {
      Authorization: authorization(source.credentials),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/><resourcetype/><getcontentlength/><getcontenttype/></prop></propfind>',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok && response.status !== 207)
    throw Object.assign(
      new Error('NAS-Verbindung oder Anmeldung fehlgeschlagen.'),
      {
        status: response.status === 401 || response.status === 403 ? 401 : 502,
      },
    );
  const xml = (await readResponseBuffer(response, 2 * 1024 * 1024)).toString(
    'utf8',
  );
  const entries = [];
  for (const block of xml.matchAll(
    /<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi,
  )) {
    const body = block[1];
    const href = unescapeXml(
      body.match(
        /<(?:[\w-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?href>/i,
      )?.[1] || '',
    ).trim();
    if (!href) continue;
    const itemUrl = new URL(href, target);
    if (
      itemUrl.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, '')
    )
      continue;
    const directory = /<(?:[\w-]+:)?collection\b/i.test(body);
    const fallback = decodeURIComponent(
      itemUrl.pathname.split('/').filter(Boolean).at(-1) || '',
    );
    const name = unescapeXml(
      body.match(
        /<(?:[\w-]+:)?displayname\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?displayname>/i,
      )?.[1] || fallback,
    ).trim();
    const relative = decodeURIComponent(
      itemUrl.pathname.slice(new URL(source.url).pathname.length),
    ).replace(/^\/+/, '');
    entries.push({
      name,
      path: relative,
      directory,
      size: Number(
        body.match(/<(?:[\w-]+:)?getcontentlength\b[^>]*>(\d+)<\//i)?.[1] || 0,
      ),
      type:
        body.match(/<(?:[\w-]+:)?getcontenttype\b[^>]*>([^<]+)<\//i)?.[1] || '',
    });
  }
  return entries.sort(
    (a, b) =>
      Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
  );
}

export async function fetchWebDavFile(source, relativePath) {
  const response = await fetch(sourceUrl(source, relativePath), {
    headers: { Authorization: authorization(source.credentials) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw Object.assign(new Error('NAS-Datei konnte nicht geladen werden.'), {
      status: response.status === 401 || response.status === 403 ? 401 : 502,
    });
  return response;
}

export async function readResponseBuffer(response, limit) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit)
    throw Object.assign(new Error('NAS-Antwort ist zu groß.'), { status: 413 });
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw Object.assign(new Error('NAS-Antwort ist zu groß.'), {
        status: 413,
      });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

/* --------------------------------------------------------------------- SMB */

const SMB_PORT = 445;
const SMB_TIMEOUTS = { connectTimeout: 10_000, requestTimeout: 30_000 };
const TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
};

export function typeFromName(name) {
  const extension = String(name).split('.').pop().toLowerCase();
  return TYPE_BY_EXTENSION[extension] || 'application/octet-stream';
}

/**
 * Baut Verbindungsdaten und den Pfad innerhalb der Freigabe. Der erste
 * Abschnitt ist die Freigabe selbst; relative Pfade dürfen die konfigurierte
 * Basis nicht verlassen.
 */
export function smbTarget(source, relativePath = '') {
  const url = new URL(source.url);
  const base = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  const extra = String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (extra.some((part) => part === '.' || part === '..' || part.includes(':')))
    throw Object.assign(new Error('Pfad liegt außerhalb der Medienquelle.'), {
      status: 400,
    });
  const credentials = source.credentials || {};
  const account = String(credentials.username || '');
  const separator = account.search(/[\\/]/);
  return {
    host: url.hostname,
    port: Number(url.port) || SMB_PORT,
    domain: separator > 0 ? account.slice(0, separator) : '',
    username: separator > 0 ? account.slice(separator + 1) : account,
    password: String(credentials.password || ''),
    path: [...base, ...extra].join('/'),
  };
}

/**
 * Die SMB-Bibliothek legt den NT-Statuscode auf `status`. Nur eigene, bereits
 * als HTTP-Status gesetzte Fehler dürfen durchgereicht werden; alles andere
 * wird übersetzt, damit kein NT-Code als Antwortstatus endet.
 */
function smbFailure(error) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status < 600) return error;
  const name = error?.name || error?.constructor?.name || '';
  if (name === 'SmbAuthError' || error?.code === 'EACCES')
    return Object.assign(
      new Error('SMB-Anmeldung fehlgeschlagen. Benutzer oder Passwort prüfen.'),
      { status: 401 },
    );
  // Samba lehnt das NEGOTIATE-Paket von smb3-client 0.2.0 ab: es hängt nach
  // dem letzten Negotiate-Kontext Füllbytes an, die Windows toleriert und
  // Samba als ungültige Länge wertet. Siehe docs/NEXT-STEPS.md.
  if (error?.statusName === 'STATUS_INVALID_PARAMETER')
    return Object.assign(
      new Error(
        'Die Freigabe lehnt die SMB-Aushandlung ab. Das deutet darauf hin, dass der Patch scripts/patch-smb3-client.mjs beim Installieren nicht gelaufen ist.',
      ),
      { status: 502 },
    );
  if (error?.code === 'ENOENT' || error?.statusName === 'STATUS_NO_SUCH_FILE')
    return Object.assign(new Error('Pfad auf der Freigabe nicht gefunden.'), {
      status: 404,
    });
  return Object.assign(
    new Error(error?.message || 'SMB-Verbindung fehlgeschlagen.'),
    { status: 502 },
  );
}

async function withSmb(source, relativePath, run) {
  const target = smbTarget(source, relativePath);
  let Client;
  try {
    ({ Client } = await import('smb3-client'));
  } catch {
    throw Object.assign(new Error('SMB-Unterstützung ist nicht installiert.'), {
      status: 501,
    });
  }
  const client = new Client({
    host: target.host,
    port: target.port,
    domain: target.domain,
    username: target.username,
    password: target.password,
    ...SMB_TIMEOUTS,
  });
  try {
    await client.connect();
    return await run(client, target);
  } catch (error) {
    throw smbFailure(error);
  } finally {
    try {
      await client.close();
    } catch {
      /* Verbindung ist bereits beendet. */
    }
  }
}

export async function browseSmb(source, relativePath = '') {
  return withSmb(source, relativePath, async (client, target) => {
    const dirents = await client.readdir(target.path, {
      withFileTypes: true,
    });
    const prefix = String(relativePath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
    const entries = dirents
      .filter((entry) => entry.name !== '.' && entry.name !== '..')
      .map((entry) => {
        const directory = entry.isDirectory();
        const relative = `${prefix ? `${prefix}/` : ''}${entry.name}`;
        return {
          name: entry.name,
          path: directory ? `${relative}/` : relative,
          directory,
          size: 0,
          type: directory ? '' : typeFromName(entry.name),
        };
      });
    return entries.sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name),
    );
  });
}

export async function readSmbFile(source, relativePath, limit) {
  return withSmb(source, relativePath, async (client, target) => {
    const stat = await client.stat(target.path);
    if (stat.isDirectory)
      throw Object.assign(new Error('Der Pfad ist ein Ordner.'), {
        status: 400,
      });
    if (stat.size > limit)
      throw Object.assign(new Error('NAS-Datei ist zu groß.'), { status: 413 });
    const data = await client.readFile(target.path);
    const content = Buffer.from(data);
    if (content.length > limit)
      throw Object.assign(new Error('NAS-Datei ist zu groß.'), { status: 413 });
    return content;
  });
}

/* ------------------------------------------- Gemeinsame Einstiegspunkte */

export function browseSource(source, relativePath = '') {
  return source.type === 'smb'
    ? browseSmb(source, relativePath)
    : browseWebDav(source, relativePath);
}

/** Liest eine Datei der Quelle und begrenzt dabei die Größe. */
export async function readSourceFile(source, relativePath, limit) {
  if (source.type === 'smb') {
    const content = await readSmbFile(source, relativePath, limit);
    return { content, type: typeFromName(relativePath) };
  }
  const upstream = await fetchWebDavFile(source, relativePath);
  if (Number(upstream.headers.get('content-length') || 0) > limit)
    throw Object.assign(new Error('NAS-Datei ist größer als erlaubt.'), {
      status: 413,
    });
  const content = await readResponseBuffer(upstream, limit);
  return {
    content,
    type: upstream.headers.get('content-type') || typeFromName(relativePath),
  };
}
