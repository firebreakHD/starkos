import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function cleanUrl(value) {
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
    const source = {
      id: randomUUID(),
      name: String(input.name || '')
        .trim()
        .slice(0, 80),
      type: 'webdav',
      url: cleanUrl(input.url),
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
    if (input.url !== undefined) source.url = cleanUrl(input.url);
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
