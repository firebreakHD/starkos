# STARK OS

STARK OS is a mobile-first media, investigation and geospatial interface for Home Assistant hosting. The supplied God's Eye View project remains the real Cesium/data engine; STARK OS adds the phone-style ring, secured direct access and paired display control.

Current Home Assistant app version: **0.1.0**

[![Add the STARK OS repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FfirebreakHD%2Fstarkos)

## Install in Home Assistant

1. Use the button above, or open **Settings → Apps/Add-ons → App store → Repositories** and add `https://github.com/firebreakHD/starkos`.
2. Reload the app store if STARK OS does not appear immediately.
3. Install **STARK OS**.
4. Set `access_password`. This is mandatory for the direct LAN URL.
5. Start the app and optionally enable the sidebar entry.

Home Assistant Ingress opens `/stark/` through the authenticated HA session. Direct access uses `http://<HOME_ASSISTANT_IP>:8788/stark/`. The host-side port can be changed in Home Assistant's network settings without changing the container port.

## Pair and control a display

1. Open STARK OS and rotate the ring to **Receiver**.
2. On your own TV/PC/tablet browser open `http://<HOME_ASSISTANT_IP>:8788/stark/receiver.html`. The passive receiver appears automatically on the phone.
3. Enter your own display name on the phone and press **CONNECT**. Pairing cannot be completed from the receiver.
4. In **Media**, import an image, video or PDF. Tap once for preview, double-tap to send to the selected online display, or drag the card onto a display target.

Pairings are persisted in `/data/displays.json`; only SHA-256 token hashes are stored. Receiver credentials remain on the paired receiver and can be revoked from STARK OS.

The Media panel also supports encrypted WebDAV NAS sources under **Medienquellen**. NAS credentials stay server-side and are never sent to a receiver. SMB is intentionally disabled until its runtime and real hardware have been tested.

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

Home Assistant reads the latest version from `starkos/config.yaml`. The same version is used as the immutable GHCR image tag. To publish an update:

1. Update `version` in `starkos/config.yaml` using semantic versioning.
2. Add the release notes to the top of `starkos/CHANGELOG.md` and update the version shown in this README.
3. Push the change to `main` and wait for **Validate** to pass.
4. Create a GitHub Release whose tag is exactly the version, for example `0.1.1` (no `v` prefix).
5. The **Publish Home Assistant app** workflow builds and signs both architectures and publishes `ghcr.io/firebreakhd/starkos:<version>` plus `latest`.
6. Make the GHCR package public after the first publish. Home Assistant will then show the newer `config.yaml` version as an available update.

Existing version tags are never overwritten. If release tag and `config.yaml` differ, publication stops before building.
