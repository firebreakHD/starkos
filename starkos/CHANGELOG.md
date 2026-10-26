# Changelog

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
