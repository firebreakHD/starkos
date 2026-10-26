import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function hashDeviceToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}
export function createDeviceToken() {
  return randomBytes(32).toString('base64url');
}

export class DisplayStore {
  constructor(
    dataDir = process.env.STARK_DATA_DIR || path.resolve('.stark-data'),
  ) {
    this.file = path.join(dataDir, 'displays.json');
    this.data = { version: 1, devices: [] };
    mkdirSync(dataDir, { recursive: true });
    try {
      const loaded = JSON.parse(readFileSync(this.file, 'utf8'));
      if (loaded?.version === 1 && Array.isArray(loaded.devices))
        this.data = loaded;
    } catch {
      /* first start or damaged state; never invent devices */
    }
  }

  save() {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data, null, 2), {
      mode: 0o600,
    });
    renameSync(temporary, this.file);
  }

  addDevice({ id, name, token, capabilities, adapter = 'stark-receiver' }) {
    const device = {
      id,
      name,
      adapter,
      capabilities,
      tokenHash: hashDeviceToken(token),
      pairedAt: new Date().toISOString(),
      lastSeenAt: null,
      state: {
        status: 'standby',
        current: null,
        playback: null,
        transform: null,
      },
    };
    this.data.devices.push(device);
    this.save();
    return device;
  }

  authenticate(id, token) {
    const hash = hashDeviceToken(token);
    return (
      this.data.devices.find(
        (device) =>
          device.id === id && !device.revokedAt && device.tokenHash === hash,
      ) || null
    );
  }
  get(id) {
    return (
      this.data.devices.find(
        (device) => device.id === id && !device.revokedAt,
      ) || null
    );
  }
  list() {
    return this.data.devices.filter((device) => !device.revokedAt);
  }
  updateState(id, state) {
    const device = this.get(id);
    if (!device) return null;
    device.state = { ...device.state, ...state };
    device.lastSeenAt = new Date().toISOString();
    this.save();
    return device;
  }
  revoke(id) {
    const device = this.get(id);
    if (!device) return false;
    device.revokedAt = new Date().toISOString();
    this.save();
    return true;
  }
}
