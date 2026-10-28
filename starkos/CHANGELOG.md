# Changelog

## 0.1.4

- Fixed Home Assistant Ingress with external/DDNS hostnames by disabling Vite's duplicate hostname filter only behind the authenticated Ingress proxy.
- Kept the source-aware STARK host check in front of every route, so arbitrary LAN clients and DNS-rebinding hostnames remain blocked.

## 0.1.3

- Redirected the add-on root to `/stark/` so STARK OS CSS and JavaScript resolve correctly on direct access and through Ingress.
- Allowed arbitrary Home Assistant public hostnames only when the request originates from the authenticated Supervisor Ingress proxy.
- Added an active-receiver preview and image/video controls directly to the phone Media panel.
- Removed playback, image-transform and move/copy controls from the separate Receiver management panel.

## 0.1.2

- Made the Home Assistant add-on root open the phone-first STARK OS shell instead of God's Eye View.
- Kept God's Eye View available explicitly through the WORLD ring module.
- Removed the redundant `access_password` option; the controller now relies on Home Assistant Ingress authentication while receiver commands remain token-protected.

## 0.1.1

- Switched Home Assistant installation to a repository-local container build so installs and updates do not depend on GHCR package visibility or accounts.
- Kept semantic version discovery through `config.yaml`; Home Assistant now builds the checked-in Dockerfile for both supported architectures.

## 0.1.0

- Initial experimental Home Assistant release.
- Added the mobile STARK media ring and integrated God's Eye View.
- Added the authenticated `stark-display/1` receiver protocol with confirmed pairing and revocation.
- Added independent multi-display media sessions, playback controls, image transforms, move/copy, transfer and end-session commands.
- Added Hermes display tools with shared authorization and capability enforcement.
- Added direct LAN authentication, Home Assistant Ingress support and persistent settings.
- Added honest adapter capability reporting; third-party TV adapters remain disabled until their real runtime is included and tested.
- Replaced pairing codes with passive receiver discovery and phone-only CONNECT/name approval.
- Removed receiver-side video controls; image and playback control now originate from the phone.
- Added a compact media toolbar and encrypted WebDAV NAS source settings, browsing and media import.
