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
  preview(id) {
    return this.request(`receivers/${encodeURIComponent(id)}/preview`);
  }
  pending() {
    return this.request('pairing/pending');
  }
  confirm(id, name) {
    return this.request(`pairing/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  rename(id, name) {
    return this.request(`receivers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  revoke(id) {
    return this.request(`receivers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  mediaSources() {
    return this.request('media-sources');
  }
  addMediaSource(source) {
    return this.request('media-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source),
    });
  }
  updateMediaSource(id, source) {
    return this.request(`media-sources/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source),
    });
  }
  removeMediaSource(id) {
    return this.request(`media-sources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  testMediaSource(id) {
    return this.request(`media-sources/${encodeURIComponent(id)}/test`, {
      method: 'POST',
    });
  }
  browseMediaSource(id, path = '') {
    return this.request(
      `media-sources/${encodeURIComponent(id)}/browse?path=${encodeURIComponent(path)}`,
    );
  }
  async mediaSourceFile(id, path) {
    const response = await fetch(
      new URL(
        `media-sources/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`,
        this.base,
      ),
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `NAS-Datei ${response.status}`);
    }
    return response.blob();
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
