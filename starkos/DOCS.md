# STARK OS documentation

## Installation

Add `https://github.com/firebreakHD/starkos` as a Home Assistant app repository, install **STARK OS**, and set a strong `access_password` before exposing the direct LAN port. Start the app and open it through Home Assistant Ingress.

Direct LAN access is available at `http://<home-assistant-host>:8788/stark/`. Port `8788` can be changed in the app's Network settings. Ingress and direct access use the same application; the direct route requires the configured password.

Settings and device pairings persist in `/data`. API tokens are not written to URLs or server logs, and the server stores only hashes of receiver tokens.

## Pairing a receiver

1. In STARK OS choose **Receiver** and generate a six-digit pairing code.
2. Open `/stark/receiver.html` on your own TV, computer or tablet.
3. Enter the code and a recognizable device name.
4. Confirm that exact device in STARK OS.
5. Select the connected display in the Media panel.

A receiver can be revoked at any time. A revoked token cannot reconnect or execute commands.

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

Home Assistant compares the installed version with `version` in `config.yaml`. Published versions are pulled from `ghcr.io/firebreakhd/starkos` using that exact tag. Enable automatic updates only if you are comfortable receiving non-breaking releases automatically; breaking versions will be declared in `config.yaml` and explained at the top of `CHANGELOG.md`.

## Troubleshooting

- If Ingress works but the LAN address does not, verify the app's Network mapping and `access_password`.
- If a receiver is offline, reopen its receiver page and verify it has not been revoked.
- If a website cannot be embedded, use its external-open action or a future screen-capture adapter; browser security policies cannot be bypassed safely.
- Pair again after clearing the receiver browser's site data.
