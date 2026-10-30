// A medium that fits travels inside the command; a larger one is handed to the
// receiver as a short-lived, session-bound address instead. The receiver never
// sees the media source's credentials or location either way.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createMediaResolver } from './receiver.js';

const SMALL = 1024;
const LARGE = 32 * 1024 * 1024;

/** A resolver whose source answers with a file of the wanted size. */
function resolverFor(size) {
  return createMediaResolver({
    mediaSources: {
      get: (id) =>
        id === 'nas1'
          ? { id: 'nas1', type: 'smb', url: 'smb://nas/Media/' }
          : null,
    },
    read: async (_source, _path, limit) => {
      if (size > limit)
        throw Object.assign(new Error('NAS-Datei ist zu groß.'), {
          status: 413,
        });
      return { content: Buffer.alloc(size, 7), type: 'video/mp4' };
    },
  });
}

const reference = (path) => ({
  title: path.split('/').pop(),
  type: 'video/mp4',
  source: { sourceId: 'nas1', path },
});

test('a medium that fits is embedded in the command', async () => {
  const media = await resolverFor(SMALL).resolve(reference('a/clip.mp4'));
  assert.ok(media.data.startsWith('data:video/mp4;base64,'));
  assert.equal(media.url, undefined);
  assert.equal(media.source, undefined);
});

test('a medium that is too large becomes a session-bound address', async () => {
  const resolver = resolverFor(LARGE);
  const media = await resolver.resolve(reference('a/film.mp4'));
  assert.equal(media.data, undefined);
  assert.match(media.url, /^\/api\/stark\/media-stream\?token=/);
  assert.equal(media.source, undefined);
  assert.ok(
    !JSON.stringify(media).includes('smb://'),
    'the receiver never learns where the file lives',
  );

  const token = new URL(media.url, 'http://stark.local').searchParams.get(
    'token',
  );
  assert.ok(token.length >= 24, 'the token should not be guessable');
  const grant = resolver.grants.get(token);
  assert.equal(grant.sourceId, 'nas1');
  assert.equal(grant.path, 'a/film.mp4');
  assert.ok(grant.expiresAt > Date.now(), 'the grant should still be valid');
});

test('an expired grant is swept and cannot be used again', async () => {
  const resolver = resolverFor(LARGE);
  const media = await resolver.resolve(reference('a/film.mp4'));
  const token = new URL(media.url, 'http://stark.local').searchParams.get(
    'token',
  );
  resolver.grants.get(token).expiresAt = Date.now() - 1;
  resolver.sweep();
  assert.equal(resolver.grants.get(token), undefined);
});

test('an unknown media source is refused', async () => {
  await assert.rejects(
    () =>
      resolverFor(SMALL).resolve({
        title: 'x',
        type: 'video/mp4',
        source: { sourceId: 'weg', path: 'a' },
      }),
    (error) => error.status === 404,
  );
});

test('media that carries its own data is passed through untouched', async () => {
  const original = {
    title: 'foto.jpg',
    type: 'image/jpeg',
    data: 'data:image/jpeg;base64,AAA',
  };
  assert.deepEqual(await resolverFor(SMALL).resolve(original), original);
});
