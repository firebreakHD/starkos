# STARK OS

Mobile-first STARK interface for research, geospatial data and secure control of paired screens. It runs as a Home Assistant app but deliberately remains a STARK OS interface rather than a smart-home dashboard.

## Highlights

- Tony-Stark-inspired media ring designed for phone touch input
- real God's Eye View geospatial engine
- paired STARK Receivers for TVs, computers and tablets
- separate show and file-transfer actions
- image transforms and video playback control from the phone
- multiple receivers with independent content
- authenticated direct access and Home Assistant Ingress
- Hermes display tools using the same authorization and capability checks as the UI

See [DOCS.md](DOCS.md) for installation and operation. Current version: **0.4.6**.

The start screen is the menu ring with **Media, Gods Eye, Receiver and Assistant**. The bottom-left gear opens settings, including Codex sign-in and source status. Assistant starts with an empty canvas and a large bottom-center **J**: hold to speak, release to send; double-tap to toggle hands-free voice. A single tap does nothing and never opens chat. Voice answers show helpful windows automatically; phones use larger text and one window at a time. Hold the small bottom-left handle for half a second and drag right for text chat. Typed questions stay in chat unless an explicit request asks to show/draw a visual explanation; that closes chat and uses the main canvas. Reopening Assistant restores the empty voice view while preserving conversation history. The small back arrow returns to the menu.

Open **gear → Einstellungen → Mit ChatGPT anmelden** for normal browser OAuth through the bundled official Codex runtime. No Claude Code, Device Code, external Hermes gateway or model API key is required. Optional `codex_model` selects a model available to your account. With Home Assistant on another machine, use the return-link form in settings to relay the final localhost redirect URL back to Codex through authenticated Ingress; see [the login guide](../docs/JARVIS.md). Codex owns its persistent credentials under `/data/codex`.

Set `searxng_url` for web/forum search through your JSON-enabled SearXNG; without it search is labeled Wikipedia only. Say/type **Demo** for a clearly labeled local preview. Installation and updates still use this GitHub repository and Home Assistant's locally built add-on.

Assistant explanations use a floating drawing workspace with vector ink, geometric 3D schematics, timelines and source highlights. Say/type **USB Demo** for a labeled, account-free preview. These are schematic visuals; models are not measured simulations.

**Optional direct HTTPS:** Configuration now exposes **Enable HTTPS**, certificate/key filenames from `/ssl` and an optional HTTPS access password. Leave it blank to open HTTPS directly without login or a previous Home Assistant visit; anyone who can reach the address can then use STARK; if set, use at least 12 characters for a separate direct login. Enable, save, restart, and configure `https://<certificate-hostname>:8789/stark/` as the STARK HTTPS URL. Ingress stays separate; this does not upgrade an HTTP Home Assistant page. See [DOCS.md](DOCS.md#optional-direct-https--voice).

**In-app HTTPS opening:** Set **STARK HTTPS URL** to the full direct address and enable **Automatically open HTTPS in the app**. Insecure Ingress attempts a top-level transition; secure Ingress stays in place. If the app blocks it, a manual opening link and browser fallback remain available. Save and restart after changing options.
