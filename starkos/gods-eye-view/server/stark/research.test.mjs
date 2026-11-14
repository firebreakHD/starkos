import assert from 'node:assert/strict';
import test from 'node:test';
import {
  publicSourceUrl,
  publicAddresses,
  createResearch,
  limitedText,
  articleText,
} from './research.js';

test('research cannot read LAN, loopback, mapped IPv6 or metadata endpoints', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '172.30.32.2',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    '::ffff:7f00:1',
    'fd00::1',
    '2001:db8::1',
  ])
    await assert.rejects(() => publicAddresses(address));
  await assert.rejects(() =>
    publicAddresses('public-looking.example', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]),
  );
  assert.throws(() => publicSourceUrl('file:///etc/passwd'));
  assert.throws(() => publicSourceUrl('https://user:pass@example.org/'));
  assert.throws(() => publicSourceUrl('https://example.org:8443/'));
});

test('redirect destinations are checked again, resolved addresses are pinned', async () => {
  let calls = 0;
  const research = createResearch({
    resolve: (host) =>
      publicAddresses(host, async () => [
        { address: '93.184.216.34', family: 4 },
      ]),
    pinned: async (url, _opts, addresses) => {
      assert.equal(addresses[0].address, '93.184.216.34');
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: 'https://127.0.0.1/private' },
      });
    },
  });
  await assert.rejects(
    () => research.read('https://example.org/article'),
    /Netzwerkadressen/,
  );
  assert.equal(calls, 1);
});

test('keyless search describes Wikipedia-only scope; SearXNG broad search is explicit', async () => {
  for (const broad of [false, true]) {
    const research = createResearch({
      env: broad ? { STARK_SEARXNG_URL: 'http://searx.local/' } : {},
      fetchImpl: async (url) => {
        assert.equal(url.searchParams.get(broad ? 'q' : 'srsearch'), 'Rotor');
        return Response.json(
          broad
            ? {
                results: [
                  {
                    title: 'Forum',
                    url: 'https://example.org/thread',
                    content: 'Discussion',
                  },
                ],
              }
            : {
                query: {
                  search: [
                    {
                      pageid: 123,
                      title: 'Rotor',
                      snippet: '<b>Rotor</b> text',
                    },
                  ],
                },
              },
        );
      },
    });
    const result = await research.search('Rotor');
    assert.equal(
      result.scope,
      broad ? 'web-via-configured-searxng' : 'wikipedia-only',
    );
    assert.equal(result.results[0].status, 'search-result-not-verified');
  }
});

test('retrieved HTML is text, not instructions executed by the UI; body size is bounded', async () => {
  assert.equal(articleText('<script>bad()</script><p>A &amp; B</p>'), 'A & B');
  await assert.rejects(() => limitedText(new Response('12345'), 4), /groß/);
  const research = createResearch({
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    pinned: async () =>
      new Response('<p>Original source.</p>', {
        headers: { 'content-type': 'text/html' },
      }),
  });
  const result = await research.read('https://example.org');
  assert.equal(result.text, 'Original source.');
  assert.equal(result.status, 'retrieved-not-fact-checked');
});
