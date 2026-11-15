// Only an explicitly configured public URL may leave the Ingress origin.
// Credentials, callback parameters and fragments must never become navigation.
export function normalizeHttpsEntry(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048)
    return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    if (url.pathname === '/') url.pathname = '/stark/';
    return url.href;
  } catch {
    return null;
  }
}
export function httpsEntry(env = process.env) {
  const url = normalizeHttpsEntry(env.STARK_HTTPS_URL);
  const enabled =
    env.STARK_HTTPS_ENABLED === 'true' &&
    env.STARK_HTTPS_ACTIVE === 'true' &&
    Boolean(url);
  return {
    enabled,
    url: enabled ? url : null,
    autoOpen: enabled && env.STARK_HTTPS_AUTO_OPEN !== 'false',
  };
}
