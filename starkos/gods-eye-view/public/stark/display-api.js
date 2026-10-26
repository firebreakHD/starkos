export class DisplayApi {
  constructor(base = new URL('../api/stark/', location.href)) {
    this.base = base;
  }
  async request(path, options = {}) {
    const response = await fetch(new URL(path, this.base), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.error || `Display API ${response.status}`);
    return payload;
  }
  list() {
    return this.request('receivers');
  }
  pending() {
    return this.request('pairing/pending');
  }
  createPair() {
    return this.request('receivers/pair', { method: 'POST' });
  }
  confirm(id) {
    return this.request(`pairing/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
    });
  }
  revoke(id) {
    return this.request(`receivers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  command(displayIds, action, payload = {}) {
    return this.request('command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayIds, action, payload }),
    });
  }
  tool(tool, args = {}) {
    return this.request('tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
    });
  }
}

export function capability(device, name) {
  return (
    Array.isArray(device.capabilities) && device.capabilities.includes(name)
  );
}
