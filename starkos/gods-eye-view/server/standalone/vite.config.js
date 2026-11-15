import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { resolveAllowedHosts } from '../../build/allowedHosts.js';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { localMcpPlugin } from '../mcp/plugin.js';
import { apiNotFoundPlugin } from './api-not-found.js';
import { standaloneVoiceTools } from './voiceTools.js';
import { unwatchedRuntimeDirsPlugin } from './unwatched-cache.js';
import { starkAuthPlugin } from '../stark/auth.js';
import { starkReceiverPlugin } from '../stark/receiver.js';
import { normalizeHttpsEntry } from '../stark/https-entry.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration and attach its local provider middleware. */
export default defineConfig(({ command, mode }) => {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const tools = standaloneVoiceTools();
  const httpsUrl =
    process.env.STARK_ADDON === 'true' &&
    process.env.STARK_HTTPS_ENABLED === 'true'
      ? normalizeHttpsEntry(process.env.STARK_HTTPS_URL)
      : null;
  return createBrowserViteConfig({
    plugins: [
      starkAuthPlugin(),
      starkReceiverPlugin(),
      ...localProviderPlugins({ realtime: { tools }, gemini: { tools } }),
      localMcpPlugin(),
      apiNotFoundPlugin(),
      unwatchedRuntimeDirsPlugin(),
    ],
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: process.env.CESIUM_ION_TOKEN,
    mapillaryToken: process.env.MAPILLARY_CLIENT_TOKEN,
    host: process.env.HOST,
    port: process.env.PORT,
    allowedHosts: resolveAllowedHosts(process.env.GEV_ALLOWED_HOSTS),
    httpsControllerHost: httpsUrl ? new URL(httpsUrl).hostname : null,
    trustHomeAssistantIngress: process.env.STARK_ADDON === 'true',
    command,
  });
});
