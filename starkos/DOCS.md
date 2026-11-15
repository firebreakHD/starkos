# STARK OS documentation

## Installation

Add `https://github.com/firebreakHD/starkos` as a Home Assistant app repository, install **STARK OS**, start it and open it through Home Assistant Ingress. Home Assistant supplies the authenticated session, so there is no second STARK OS password.

Port `8788` is used by passive receiver pages such as `http://<home-assistant-host>:8788/stark/receiver.html` and can be changed in the app's Network settings. The phone controller is opened through authenticated Home Assistant Ingress.

Settings and device pairings persist in `/data`. API tokens are not written to URLs or server logs, and the server stores only hashes of receiver tokens.

## Optional direct HTTPS / Voice

The **Configuration** tab now includes **Enable HTTPS**, **Certificate file**, **Private key file** and **HTTPS access password**, with German/English labels. This creates an additional native HTTPS entry; Home Assistant Ingress keeps its existing internal HTTP connection.

1. Put your existing certificate chain and matching private key in Home Assistant's `/ssl` directory. Defaults are `fullchain.pem` and `privkey.pem`. Enter filenames only; the add-on mounts `/ssl` read-only. The hostname and certificate chain must be accepted by your phone. A certificate for a domain does not authenticate access by its IP address.
2. The HTTPS access password is **optional**. Leave it blank to open HTTPS through your authenticated Home Assistant session. Alternatively, set at least 12 non-padding characters to allow a separate direct password login; this is separate from the ChatGPT account login.
3. Enable **HTTPS**, save and restart the add-on. The standard HTTPS network mapping is **8789 → 8443**. You can change the published port in the add-on's Network section.
4. Configure **STARK HTTPS URL** as `https://<certificate-hostname>:8789/stark/` and open STARK through Home Assistant. With an empty password, the opening link uses a short-lived, one-use POST handoff from authenticated Ingress. With a configured password, you can also open the address directly in Safari and sign in, then use J. The hostname/port must be reachable through your existing LAN, VPN or configured proxy. The add-on does not change router forwarding or create certificates.

Voice still requires browser microphone permission and SpeechRecognition support. Enabling this listener does **not** change an HTTP Home Assistant parent page into HTTPS; an Ingress iframe opened inside that page remains an insecure context. Use the direct HTTPS address or load Home Assistant itself through its trusted HTTPS address.

The standard routing chain is **router external 8789 → HA machine 8789 → container 8443**. If you changed the published port in the add-on Network section, use that published host port for the router target. Do not target a container-only port at the HA host. Check the `[HTTPS]` line in the add-on log to distinguish a failed listener startup from an external routing problem.

HTTPS is disabled by default. If a nonempty password is too short, files are missing, or the certificate/key is invalid, the direct entry stays closed and the add-on log explains why. Ingress remains available to correct the settings. The existing HTTP port remains a passive receiver entry and cannot use HTTPS credentials or cookies to access the controller.

## Open HTTPS from the Home Assistant app

After direct HTTPS is configured, enter its complete URL in **STARK HTTPS URL**, for example `https://<certificate-hostname>:8789/stark/`, and enable **Automatically open HTTPS in the app**. Save and restart. The configured hostname/port must be reachable from the phone, including away from home.

Before automatic navigation, STARK checks the configured target from the current phone/browser using a credential-free public health probe. The TLS certificate, network path and STARK service response must be confirmable. On failure, the HA view stays open and displays a check message beside the explicit links. A working listener inside the add-on does not prove that a mobile connection can reach its public address. A proxy/browser policy that blocks the probe also leaves the user in HA with manual links. When the target is verified and STARK loads inside an insecure Ingress page, it attempts to navigate the **entire view** to that URL. Moving only the iframe would retain the insecure ancestor and keep Voice blocked. Already-secure Ingress is preserved; the settings link can still open the direct entry manually. With an empty HTTPS password, STARK transfers authorization from authenticated Ingress through a one-use POST handoff valid for 60 seconds, then sets a Secure/HttpOnly/SameSite session. Tokens never enter URLs or browser storage. Opening the HTTPS address without that handoff shows instructions to return through Home Assistant; anonymous controller access remains disabled. If you set an HTTPS password, the direct entry offers its password login.

App/WebView sandbox policies can block automatic top-level navigation or hand external URLs to the browser. STARK keeps **Open HTTPS in this view** available in settings and the insecure-Voice error, plus an explicit browser fallback. Browser fixtures verify automatic and user-activated transitions; native iPhone app policies are not certified by those tests. Back navigation is protected against repeated automatic attempts in the same tab. No configured URL, inactive HTTPS, or unavailable metadata leaves normal Ingress in place.

## Pairing a receiver

1. Open `/stark/receiver.html` on your own TV, computer or tablet. The receiver is passive and has no pairing controls.
2. In STARK OS on the phone choose **Receiver**.
3. Give the discovered display your own recognizable name and press **CONNECT**.
4. All pairing approval and later media control remains on the phone.
5. Select the connected display in the Media panel.

A receiver can be revoked at any time. A revoked token cannot reconnect or execute commands.

## NAS media sources

In **Media → Medienquellen**, add a WebDAV share with a display name, HTTP(S) address, username and password. STARK OS stores the credentials encrypted in `/data`; they are never returned to the browser, placed in URLs or sent to receivers. You can test, edit, browse and remove each source. Supported images, videos and PDFs are loaded into the same preview and display workflow as local files.

SMB/CIFS is read through `scripts/smb-storage.py`, a helper built on `smbprotocol` — the maintained Python implementation, pinned in the add-on image. The JavaScript clients available are refused by Samba, which is what Synology, QNAP and OpenMediaVault run. The request reaches the helper as one JSON line on stdin, so the password never appears in a command line, an environment variable or a log. Credentials stay server-side, requested paths cannot leave the configured share, symlinks are skipped, and files are size-capped exactly like WebDAV. Listing a real share has not been confirmed yet; use `scripts/smb-diagnose.mjs` and report what it prints rather than assuming it works.

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
