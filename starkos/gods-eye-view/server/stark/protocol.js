export const STARK_DISPLAY_PROTOCOL = 'stark-display/1';
export const PROTOCOL_VERSION = 1;
export const MEDIA_GRANT_MS = 2 * 60 * 60_000;

export const CAPABILITIES = Object.freeze([
  'media.image',
  'media.video',
  'media.pdf',
  'media.web',
  'playback.pause',
  'playback.seek',
  'playback.volume',
  'playback.queue',
  'image.transform',
  'file.transfer',
]);

export const RECEIVER_CAPABILITIES = Object.freeze([...CAPABILITIES]);

export function sanitizeCapabilities(values) {
  const requested = new Set(Array.isArray(values) ? values : []);
  return CAPABILITIES.filter((capability) => requested.has(capability));
}

export function requiredCapability(action, payload = {}) {
  if (action === 'media.show') {
    if (payload.mode === 'transfer') return 'file.transfer';
    if (String(payload.media?.type || '').startsWith('image/'))
      return 'media.image';
    if (String(payload.media?.type || '').startsWith('video/'))
      return 'media.video';
    if (payload.media?.type === 'application/pdf') return 'media.pdf';
    if (payload.media?.type === 'text/uri-list') return 'media.web';
  }
  if (action === 'playback.pause' || action === 'playback.resume')
    return 'playback.pause';
  if (action === 'playback.seek') return 'playback.seek';
  if (action === 'playback.volume') return 'playback.volume';
  if (action === 'playback.next' || action === 'playback.previous')
    return 'playback.queue';
  if (action === 'image.transform' || action === 'image.reset')
    return 'image.transform';
  return null;
}
