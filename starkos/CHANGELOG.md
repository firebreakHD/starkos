# Changelog

## 0.1.15

- Added `scripts/smb-diagnose.mjs`, which walks the SMB steps the media browser takes against a real share and reports where it stops. Credentials are passed on the command line and never stored.

## 0.1.14

- Fixed listing a NAS directory over SMB. When it pages through a large folder, `smb3-client` sends no search pattern but still reports a file name offset; MS-SMB2 requires that offset to be 0, and Samba answers STATUS_OBJECT_NAME_INVALID. The install patch now corrects this request as well.
- SMB addresses are entered as `host/share/folder`. The `smb://` prefix is no longer typed or shown, and saved sources are listed in the same short form.

## 0.1.13

- Fixed SMB shares on Samba servers, which is what Synology, QNAP and OpenMediaVault run. The `smb3-client` dependency appends padding after the last SMB2 negotiate context; Samba validates the message length and refused the whole negotiation with STATUS_INVALID_PARAMETER, before any authentication. A postinstall patch removes those bytes, and a unit test fails if an install or a version bump brings them back.
- SMB errors now name what actually happened instead of surfacing the raw protocol wording.

## 0.1.12

- STARK OS no longer opens God’s Eye View in embed mode, so the engine shows its own interface again: layers, cameras, context, address search and settings are reachable on desktop and on the phone.
- Added a discreet back control to God’s Eye View that returns to the STARK OS ring; it steps aside in the engine’s clean view and resolves correctly behind Home Assistant Ingress.

## 0.1.11

- Added SMB media sources next to WebDAV, built on the pinned `smb3-client` library: SMB 2.1 to 3.1.1 with NTLMv2, message signing and encryption. Credentials stay encrypted server-side and are never placed in a URL, a log or a receiver message.
- Requested paths cannot leave the configured share, and SMB files are size-capped like WebDAV ones. NT status codes are translated into real HTTP statuses instead of surfacing raw protocol numbers.
- Stepping through images no longer stalls and the preview no longer goes black: the preview element is reused instead of rebuilt, local media are decoded once into an object URL, and no new load is started while the wheel is turning.

## 0.1.10

- Rebuilt the media browser to match the approved reference design: the wheel is drawn on canvas with its rings, tick marks, wedge segments and thumbnails, and the amber selection marker stays fixed at twelve o'clock.
- Slowed and steadied the rotation to one entry per deliberate turn of the ring, with a quiet snap once the wheel comes to rest.
- The browser now fills the whole screen on the phone: no panel header, no heading and no inner frame; only the safe areas stay clear.
- The enlarged image is now its own fixed-size view that stays open after the gesture instead of springing back; further two-finger gestures zoom it, one finger pans and a double tap returns to the image selection.
- Removed the file transfer button below the preview.

## 0.1.9

- Rebuilt the media browser around two wheels: a folder wheel that shows at most three folder names without wrap-around, and an image wheel whose amber selection marker stays fixed at twelve o'clock while reused thumbnail segments travel underneath it.
- The empty circle at the wheel centre loads the selected folder, and only while the wheel is at rest; in the image selection a single tap switches between manual transfer and auto-switch, a double tap returns to the folder selection.
- Added the pinch-to-open gesture on the framed preview: it sends the image in manual mode and keeps the enlarged view open, where further two-finger gestures zoom, one finger pans and a double tap returns to the image selection without closing the receiver's content.
- Zoom and pan of the opened image are forwarded to the paired receiver through the existing image transform commands, bound to the current media session and coalesced instead of sent per movement event.
- Added a discreet top display for the receiver's confirmed content; in manual mode it deliberately does not follow the local selection and only updates after the receiver confirms.
- The layout follows the measured container size, so portrait and landscape also reflow correctly inside Home Assistant Ingress without reloading or losing the selection.
- Removed the display target row and receiver monitor below the wheel; sending now addresses the selected or first connected receiver.

## 0.1.8

- Added a clearly labelled MEDIENBROWSER entry inside MEDIA and separated NAS browsing from optional NAS connection settings.
- Moved the draggable selection wheel and LOAD control to the left in landscape, with folder/file or image preview on the right; portrait keeps the compact stacked layout.
- LOAD ORDNER now imports the supported images, videos and PDFs from the selected NAS folder into the persistent media wheel.
- Added double-tap-to-send on the image preview, pinch-to-transmit, live pinch/pan/rotation synchronization and an always-visible zoom/rotate/reset bar on the phone.

## 0.1.7

- Rebuilt the Media panel as one adaptive browser: large preview plus selection wheel in landscape and a thumb-reachable stacked arrangement in portrait.
- Added persistent in-memory media selection, previous/next navigation and live pinch/pan/rotation on the selected image without remounting on orientation changes.
- Replaced NAS directory tiles with a responsive folder/file wheel and a connected LOAD control.
- Reduced the disconnected receiver monitor to a compact status strip while retaining the live receiver preview and controls when media is active.

## 0.1.6

- Replaced the Vite development server in the Home Assistant add-on with a runtime production build and preview server.
- Ensured CSS, JavaScript, workers and media assets use relative URLs under Home Assistant's installation-specific Ingress path.
- Kept runtime add-on options available to the production build and retained the development server outside Home Assistant.

## 0.1.5

- Allowed STARK OS documents from the authenticated Home Assistant Ingress proxy to render inside Home Assistant's same-origin iframe.
- Retained `DENY`/`frame-ancestors 'none'` framing protection for direct access, assets and untrusted requests.

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
