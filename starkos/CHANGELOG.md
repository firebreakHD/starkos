# Changelog

## 0.5.0

- Integrated the actual Roamies Ink renderer, Jarvis cursor, drawing sounds, 3D engine, fonts, map data and draw/see_photo schemas from KenKaiii/Roamies (commit e0ef435658a0206d5948142204f7be8ef5b1d969). This adds original cards, source clippings, graphs, tables, flow diagrams, timelines, photos, molecules, animated models, maps, maths, geometry and interactive quizzes to the Codex tool loop.
- Phone explanations focus one readable card at a time, with enlarged text, swipes and scrolling for wide structures. Model viewports adapt to short landscape screens without shrinking the labels. Desktop keeps simultaneous floating cards. The Voice button and side chat gesture remain the controls; text chat opens the drawing only when explicitly requested.
- Source annotations use text bounds measured by the renderer. Photo labels require the actual see_photo image, delivered to Codex as image input. Edits refer to real part IDs. Paired browser receivers advertise ink.roamies; unsupported receivers reject it.
- Added upstream provenance, AGPL source/license notices and a source link in settings. Original upstream engine MIT notices remain preserved. Desktop OS automation is unavailable in the browser and is never reported as performed.

## 0.4.6

- Fixed the white, unstyled STARK page when opening /stark without the final slash. The server now redirects to /stark/ before the browser resolves relative CSS and JavaScript, preserving query parameters and Home Assistant Ingress prefixes.
- Configured HTTPS URLs ending in /stark are normalized to /stark/. Existing bookmarks work through the server redirect. Direct no-login HTTPS behavior is preserved.
- HTTPS browser checks now cover slashless addresses, loaded styles and a running JavaScript clock, including fresh visits, reloads and the optional password login.

## 0.4.5

- Empty HTTPS passwords now mean direct access without any STARK login, session cookie, prior Home Assistant visit or authorization handoff. Direct opening, refreshes and new browser tabs immediately show STARK, including Voice. Anyone who can reach that HTTPS address can control STARK in this mode.
- Removed the login handoff and its Home Assistant instruction screen. A configured nonempty password retains the existing login. Native TLS and configured-host checks remain required; direct HTTP stays passive-only.
- Home Assistant Ingress continues opening STARK without an additional STARK login. Voice still needs a secure browser context, supported speech recognition and microphone permission.

## 0.4.4

- Raised the Home Assistant add-on version to deliver the HTTPS hostname fix and optional-password login as a fresh update. Reload the add-on store, update STARK OS, and restart before opening through Home Assistant.

## 0.4.3

- Fixed “Blocked request. This host is not allowed” when opening the configured public STARK HTTPS address. Its exact hostname is now admitted on the native TLS listener, while HTTP and unrelated or wildcard hostnames retain their existing restrictions.
- Browser regression fixtures now use a public-style hostname instead of a loopback IP, exercising the configured host through the complete HTTPS login and Home Assistant handoff.

## 0.4.2

- The HTTPS password is now optional. Empty passwords no longer prevent TLS startup: open STARK through Home Assistant and its authenticated session is transferred using a one-use, 60-second POST handoff. Anonymous direct controller access remains disabled. Configured passwords still require at least 12 characters.

- Automatic HTTPS opening now first checks the configured STARK endpoint from the phone/browser, including certificate and network reachability. A running listener inside the add-on alone is no longer treated as proof that the public address works.
- Failed, wrong-service or unconfirmed checks leave Home Assistant open and show an actionable message beside the explicit opening links. The only cross-origin probe is the public health endpoint; credentials are omitted and controller routes stay protected.
- Clarified the standard STARK mapping: router 8789 → HA host 8789 → container 8443. Router forwarding uses the published host port, not the container-only port.

## 0.4.1

- Added a configured STARK HTTPS address and an automatic in-app opening option. When Ingress is insecure, STARK attempts to navigate the entire view to that address, avoiding an insecure parent frame. Already-secure Ingress stays in place.
- If the WebView blocks automatic navigation, settings and the Voice error offer an explicit in-view opening link plus a browser fallback. Only active HTTPS with a configured credential-free URL is used; native app policies may still require the fallback. Automatic attempts are limited per tab to keep Back usable.

## 0.4.0

- Added a real optional HTTPS listener and GUI settings: enable HTTPS, certificate filename, private-key filename and an access password. Certificates are read from the read-only /ssl mount. The default direct HTTPS port is 8789; Home Assistant Ingress and the passive HTTP receiver port remain separate.
- Direct HTTPS controllers require native TLS and their configured password. Secure, HTTP-only session cookies, same-site login checks and login throttling protect that entry. HTTP cannot use those credentials or sessions to become a controller. Ingress continues to use Home Assistant authentication.
- Invalid certificates, mismatched keys, missing files or a password shorter than 12 characters disable the HTTPS entry with an actionable log message, while keeping Ingress available. HTTPS is off by default.
- Added German/English labels and descriptions for every add-on configuration field. Passive receivers can load the visual renderer modules over HTTP as intended.
- The direct HTTPS URL must use a matching, trusted certificate. Enabling this listener does not upgrade an HTTP Home Assistant page or its embedded Ingress view; open the direct HTTPS URL in Safari for that route.

## 0.3.3

- The left chat handle is slightly larger. Pressing gives round feedback; after the hold it stretches into an edge-anchored pill as you pull right, rather than sliding over J.
- The conversation is progressively revealed behind the pull while the voice controls yield to the side. Releasing past the threshold completes the transition; short taps, early drags and cancellations retract cleanly without opening chat.
- The pull preview is inert and cannot focus an input or open the keyboard before release. Existing voice gestures, chat history, keyboard accessibility and reduced-motion preferences are preserved.

## 0.3.2

- Renamed the Assistant voice-view label to **Voice**, including the chat return button and accessible mode/status labels. Gestures and microphone behavior are unchanged.

## 0.3.1

- Corrected J-button gestures: short tap does nothing, hold records until release, and double-tap toggles hands-free voice. Hands-free listening resumes after the reply; closing/leaving, losing focus, Stop or another double-tap disables it. Missing speech support or HTTPS reports an error without opening chat. The left hold-and-drag handle remains the only chat control.
- Removed the scanline overlay from Assistant and increased text contrast. Narrow visual windows show numbered references with normal-size HTML labels instead of shrinking labels with an SVG. Labels keep at least 19 CSS pixels and wrap into a single column on very narrow screens.
- Presentations adapt to the actual available width: compact controllers and embedded panels show windows sequentially; wider workspaces keep readable labels even in smaller neighboring windows. Full narration remains readable by scrolling above a separate bottom control dock, with no text behind J.

## 0.3.0

- Replaced prose/flow-card presentation with a drawing workspace: floating windows with luminous outlines, staggered entrances, animated vector ink, source underlines and a separate narration caption. The idle Assistant canvas and bottom voice/chat controls stay clear.
- Added declarative free drawings, labeled rotating geometric 3D schematics and timelines alongside source excerpts, diagrams and calculation windows. Hermes/Codex chooses and constructs the visual for the question; object explanations are instructed to draw the subject, rather than reduce it to boxes of words.
- Say or type **USB Demo** for a fixed, labeled example: open the USB stick in 3D, identify its connector/controller/flash, then draw the data path. No account is needed for this demo. Models are schematic geometry, not photographs or measured simulations.
- Desktop shows several independently positioned windows; phones show them sequentially with larger labels. Pause freezes model motion, source reading pauses playback, background tabs suspend animation, and reduced-motion settings disable rotation and ink animation. The same renderer runs on paired receivers.
- Visuals remain bounded data rendered locally; no model-authored HTML, SVG markup, scripts or external models execute. Existing login, text-only chat behavior and explicit visual-request enforcement stay in place.

## 0.2.6

- Visual requests also recognize common spelling such as “visuel”, including the USB-stick question. Explicit visual chat requests now require an executed presentation tool before returning a final answer, rather than accepting an emoji/ASCII diagram in chat.
- A bounded correction step asks the model to create the missing visual or fix a rejected presentation. If it still cannot, STARK reports the failure instead of claiming success. Ordinary text chat stays text-only; successful explanations close chat and use the main canvas as before.

## 0.2.5

- World is now named **Gods Eye**. The menu contains Media, Gods Eye, Receiver and Assistant; Investigation is removed from the ring. Settings and source status are reached through the gear at the bottom left of the menu.
- Codex browser sign-in, sign-out and the always-visible signed-out return-link field now live in settings. The field remains accessible with missing/expired pending state or a failed status check; inline errors allow retry. No sign-in UI occupies the Assistant canvas.
- Assistant opens an empty canvas with a large bottom-center J. Hold to record and release to send; cancellation, leaving the view or losing focus discards unsent recording. The small left handle still grows after a half-second hold and opens text chat when dragged right. Reopening Assistant clears the canvas and restores voice mode while preserving the conversation.
- Voice turns enable helpful visual explanations by default. Typed questions remain text-only unless explicitly requesting visuals; permitted explanations close chat and use the main canvas. The server independently blocks unsolicited chat presentation/control tools. Mobile layouts retain larger text and sequential windows.

## 0.2.4

- Fixed the browser-login return flow: a pending Codex login now restores the visible link-entry step when the phone returns to STARK or reloads the page, instead of hiding it behind a collapsed section.
- Login instructions and progress stay visible, duplicate completion attempts are blocked, and invalid links or connection failures show actionable inline errors so the form can be retried. Returning to the app immediately rechecks the account.
- The callback accepts copied localhost/127.0.0.1 aliases, forwards only to the original fixed IPv4 listener, and waits for Codex account confirmation after delivery. Successful retries do not exchange a one-use code again. Browser OAuth remains the only Codex login flow.

## 0.2.3

- Assistant opens in its normal voice view. A small bottom-left handle grows after a half-second hold; dragging it right opens the text conversation. Short taps and cancelled/early drags leave the voice view in place. Keyboard and assistive activation remain available.
- The text drawer shows the shared conversation history and live visual explanations, with one back-to-voice action. Closing, Escape or leaving and reopening Assistant always restores the voice view. No open-chat preference is saved.
- Opening text mode stops microphone capture and spoken playback. Typed messages use the same Codex conversation and display tools; contextual Stop also remains available in the drawer.

## 0.2.2

- Restored the original STARK menu ring as the start screen, with Media, Investigation, World, Receiver and System intact.
- Added Assistant as its own sixth menu entry. It opens Jarvis for research, visual explanations, media and display tools; Investigation once again opens the original case board.
- The Assistant connection now starts only when that menu entry is opened. Returning through Bereiche stops the current conversation activity and brings back the menu without replacing its selected entry.
- Tapping a ring entry now selects it reliably despite pointer capture; dragging still rotates and coasts the ring.

## 0.2.1

- Jarvis now uses the bundled official Codex runtime by default, signed in with the user's ChatGPT account through normal browser OAuth. There is no Device Code flow, no Claude Code dependency and no required model API key or external Hermes gateway.
- A single contextual **Mit ChatGPT anmelden** action starts Codex's browser login. For a Home Assistant server reached from another device, a protected optional form relays the final localhost callback URL to Codex; its state, destination and expiry are validated. This extra step is necessary because Codex's official OAuth callback is local to the server.
- Codex owns credential storage and refresh in the persistent, separate `/data/codex` directory. STARK never reads or returns its tokens. Native shell, browser, apps and delegation are disabled for model completion; media/research actions continue through the authenticated STARK tool contract.
- Signing out or starting a new login clears prior conversation history. The original explicit gateway transport remains available for compatibility through an environment setting, never as an automatic API-key fallback.

## 0.2.0

- STARK opens a conversation with Jarvis instead of a ring of controls. One microphone action starts browser speech recognition, replies can be spoken, and Stop cancels the current turn. Text input and the existing ring remain available.
- Added a server-side connection to an operator-configured Hermes OpenAI-compatible chat-completions endpoint with tool calling. Hermes stays the only agent; missing configuration is shown honestly. Endpoint credentials never reach the browser or receivers.
- Hermes can search Wikipedia, read public HTTPS articles, and optionally discover websites/forums through an operator's JSON-enabled SearXNG. Source windows require a retrieved quotation; snippets and retrieved pages are not labeled verified facts.
- Added data-only visual explanation tools and timed scenes for source excerpts, highlights, diagrams and calculation notes on the controller and paired receivers. Desktop shows several windows; phones use larger type and one window at a time. Voice commands advance, pause, close or suppress explanations. A labeled offline Demo is available by voice or text.
- Reloading an authenticated receiver refreshes its declared capabilities without repeating pairing. Existing media, Ingress authorization and receiver restrictions remain in place. Native control over unrelated desktop apps is not included.

## 0.1.18

- A medium from a NAS source is now addressed by reference, and the server decides by size how it reaches the receiver: small enough travels inside the command as before, larger is handed over as a short-lived, session-bound address the receiver fetches itself. Videos beyond the connection limit therefore play on the receiver instead of being refused.
- The address carries a random token, is valid only for that one file, expires with the media grant and is swept once it does. The receiver never learns the credentials of the media source, nor where the file lives.
- Sending no longer pulls the file through the phone first, so large media start faster.

## 0.1.17

- Videos are no longer loaded into the selection preview, where the picture would only appear once the whole file had arrived. The frame names the file and says that pulling it open plays it.
- The enlarged view plays videos, streamed straight from the source: the file route answers byte ranges now, so the browser fetches only what it needs instead of pulling the whole file through the add-on.
- Sending a video that is too large for the receiver connection is refused with its size instead of failing part way through. Everything that fits is still sent as before.

## 0.1.16

- SMB media sources now read through `smbprotocol`, the maintained Python implementation, instead of a JavaScript client. The previous client was refused by Samba — what Synology, QNAP and OpenMediaVault run — and two spec fixes were not enough to make it work. The add-on image carries Python and the library for this.
- The helper receives its request as one JSON line on stdin, so the password never appears in a command line, an environment variable or a log. Paths still cannot leave the configured share, symlinks are skipped, and files stay size-capped.
- `scripts/smb-diagnose.mjs` now exercises the same code path the media browser uses and reports which step fails.

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
