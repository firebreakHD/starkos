// Home Assistant Ingress exposes the app below a per-session path. Existing
// God's Eye provider routes intentionally use absolute /api URLs, so prefix
// only those requests when the document is running behind Ingress. Direct LAN
// access remains byte-for-byte equivalent.
const ingressMatch = globalThis.location?.pathname?.match(
  /^(\/api\/hassio_ingress\/[^/]+)/,
);

export const starkIngressBase = ingressMatch?.[1] || '';

if (starkIngressBase && !globalThis.__STARK_INGRESS_FETCH__) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/'))
      return nativeFetch(`${starkIngressBase}${input}`, init);
    if (input instanceof Request) {
      const url = new URL(input.url);
      if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
        url.pathname = `${starkIngressBase}${url.pathname}`;
        return nativeFetch(new Request(url, input), init);
      }
    }
    return nativeFetch(input, init);
  };
  globalThis.__STARK_INGRESS_FETCH__ = true;
}
