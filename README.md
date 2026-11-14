# STARK OS

STARK OS is a mobile-first media, investigation and geospatial interface for Home Assistant hosting. The supplied God's Eye View project remains the real Cesium/data engine; STARK OS adds the phone-style ring, secured direct access and paired display control.

Current Home Assistant app version: **0.2.0**

## Talk to Jarvis

STARK OS now opens a conversation instead of a button dashboard. Tap the Jarvis orb to speak, or expand **Lieber schreiben**. Hermes remains the only agent; Jarvis is its spoken interface. **Bereiche** keeps the existing media ring, receivers and World accessible. Say “Öffne Medien”, “Öffne Karte”, “weiter”, “bleib hier”, “zurück”, “Stopp”, or “ohne Fenster”. Say or type **Demo** to try the visual sequence without an agent connection; its example data are explicitly labeled.

Configure the existing Hermes deployment through an **OpenAI-compatible chat-completions endpoint with function/tool calling**. This is an integration contract, not a claim that every Hermes deployment exposes that API. In Home Assistant set `hermes_url` to its full `/v1/chat/completions` URL, `hermes_model` to the model/deployment ID, and optionally `hermes_api_key`. For local GitHub development use the corresponding `STARK_HERMES_*` variables in `starkos/gods-eye-view/.env`. No agent is bundled or impersonated when the connection is absent; the interface says it is not connected. See [the integration guide](docs/JARVIS.md).

Visual explanations open source excerpts, highlighted passages, diagrams and calculation notes in timed scenes. Desktop shows up to three windows; phones show the same content one readable window at a time, with larger type and swipe navigation. Existing paired receivers learn the new capabilities after their receiver page is reloaded.

Optional `searxng_url` points at your SearXNG instance with JSON search enabled for general website/forum discovery. Without it, search is explicitly **Wikipedia only**; public HTTPS articles and forums can still be read by URL. Sources are not automatically declared correct. Voice input depends on browser speech recognition, microphone permission and a secure HTTPS context (or localhost). Browser/OS speech output is used; this does not bundle Roamies' voices or native desktop control.

[![Add the STARK OS repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FfirebreakHD%2Fstarkos)

## Install in Home Assistant

1. Use the button above, or open **Settings → Apps/Add-ons → App store → Repositories** and add `https://github.com/firebreakHD/starkos`.
2. Reload the app store if STARK OS does not appear immediately.
3. Install **STARK OS**.
4. Start the app and optionally enable the sidebar entry.

Home Assistant Ingress opens the phone-first STARK OS shell through the authenticated HA session; no additional access password is required. Port `8788` remains available for your passive receiver pages. The controller itself stays behind Home Assistant authentication.

## Pair and control a display

1. Open STARK OS and rotate the ring to **Receiver**.
2. On your own TV/PC/tablet browser open `http://<HOME_ASSISTANT_IP>:8788/stark/receiver.html`. The passive receiver appears automatically on the phone.
3. Enter your own display name on the phone and press **CONNECT**. Pairing cannot be completed from the receiver.
4. In **Media**, import an image, video or PDF. Tap once for preview, double-tap to send to the selected online display, or drag the card onto a display target.

Pairings are persisted in `/data/displays.json`; only SHA-256 token hashes are stored. Receiver credentials remain on the paired receiver and can be revoked from STARK OS.

The Media panel also supports encrypted WebDAV NAS sources under **Medienquellen**. NAS credentials stay server-side and are never sent to a receiver. SMB shares are supported as well. Enter the share as `host/share/folder`, for example `192.168.1.10/Media/Bilder`; the account may carry a domain as `DOMAIN\user`. SMB is spoken by a small Python helper built on `smbprotocol`, which the add-on image carries, because the JavaScript clients available are refused by Samba.

## Local development

```powershell
cd starkos/gods-eye-view
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/stark/` and the receiver in a second tab at `http://127.0.0.1:4173/stark/receiver.html`.

Validation:

```powershell
npm run build
node --test server/stark/receiver.test.mjs
npm audit --audit-level=high
```

Protocol and Hermes details are in [docs/DISPLAY-PROTOCOL.md](docs/DISPLAY-PROTOCOL.md). Adapter and keyless-source decisions are in [docs/ADAPTERS-AND-SOURCES.md](docs/ADAPTERS-AND-SOURCES.md).

## Updates and releases

Home Assistant reads the latest version from `starkos/config.yaml` and builds the checked-in Dockerfile locally. This avoids private-registry credentials and keeps installation account-free. To publish an update:

1. Update `version` in `starkos/config.yaml` using semantic versioning.
2. Add the release notes to the top of `starkos/CHANGELOG.md` and update the version shown in this README.
3. Push the change to `main` and wait for **Validate** to pass.
4. Optionally create a matching Git tag for the release history, for example `v0.1.8`.
5. Reload the repository in Home Assistant. It will show the newer `config.yaml` version and build it during install/update.

The optional **Publish Home Assistant app** workflow is reserved for a future public pre-built image. It is not required for installation or updates.
