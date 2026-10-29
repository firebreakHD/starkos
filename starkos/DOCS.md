# STARK OS documentation

## Installation

Add `https://github.com/firebreakHD/starkos` as a Home Assistant app repository, install **STARK OS**, start it and open it through Home Assistant Ingress. Home Assistant supplies the authenticated session, so there is no second STARK OS password.

Port `8788` is used by passive receiver pages such as `http://<home-assistant-host>:8788/stark/receiver.html` and can be changed in the app's Network settings. The phone controller is opened through authenticated Home Assistant Ingress.

Settings and device pairings persist in `/data`. API tokens are not written to URLs or server logs, and the server stores only hashes of receiver tokens.

## Pairing a receiver

1. Open `/stark/receiver.html` on your own TV, computer or tablet. The receiver is passive and has no pairing controls.
2. In STARK OS on the phone choose **Receiver**.
3. Give the discovered display your own recognizable name and press **CONNECT**.
4. All pairing approval and later media control remains on the phone.
5. Select the connected display in the Media panel.

A receiver can be revoked at any time. A revoked token cannot reconnect or execute commands.

## NAS media sources

In **Media → Medienquellen**, add a WebDAV share with a display name, HTTP(S) address, username and password. STARK OS stores the credentials encrypted in `/data`; they are never returned to the browser, placed in URLs or sent to receivers. You can test, edit, browse and remove each source. Supported images, videos and PDFs are loaded into the same preview and display workflow as local files.

SMB/CIFS is implemented on top of the `smb3-client` library (SMB 2.1 to 3.1.1, NTLMv2, signing and encryption). Credentials stay server-side, requested paths cannot leave the configured share, and files are size-capped exactly like WebDAV. The SMB path has not yet been verified against real NAS hardware, so report problems rather than assuming it is proven.

## Media gestures

- Tap a media card once to preview it locally.
- Double-tap to show it on every selected receiver.
- Drag the card onto a receiver target to show it there.
- Use **Transfer file** when the file must be copied instead of merely displayed.
- Use **Copy** to add content to another display or **Move** to end it on the source display.

Image zoom, position, rotation and reset are synchronized with the receiver. Video controls include pause, resume, seek, volume, previous and next. Unsupported controls are disabled from the advertised receiver capabilities rather than simulated.

## Optional data providers

STARK OS starts with the account-free sources retained by God's Eye View. Provider keys in the Configuration tab are optional and only enable their respective upstream services. See the repository's `docs/ADAPTERS-AND-SOURCES.md` for the support matrix and the reasons a paid/keyed source was retained where no equivalent exists.

## Updates

Home Assistant compares the installed version with `version` in `config.yaml` and builds the repository's Dockerfile locally during installation or update. No container-registry account is required. Enable automatic updates only if you are comfortable receiving non-breaking releases automatically; breaking versions will be declared in `config.yaml` and explained at the top of `CHANGELOG.md`.

## Troubleshooting

- If the receiver URL does not open, verify the app's Network mapping for port `8788`.
- If a receiver is offline, reopen its receiver page and verify it has not been revoked.
- If a website cannot be embedded, use its external-open action or a future screen-capture adapter; browser security policies cannot be bypassed safely.
- Pair again after clearing the receiver browser's site data.
