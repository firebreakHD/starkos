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

See [DOCS.md](DOCS.md) for installation and operation. Current version: **0.3.2**.

The start screen is the menu ring with **Media, Gods Eye, Receiver and Assistant**. The bottom-left gear opens settings, including Codex sign-in and source status. Assistant starts with an empty canvas and a large bottom-center **J**: hold to speak, release to send; double-tap to toggle hands-free voice. A single tap does nothing and never opens chat. Voice answers show helpful windows automatically; phones use larger text and one window at a time. Hold the small bottom-left handle for half a second and drag right for text chat. Typed questions stay in chat unless an explicit request asks to show/draw a visual explanation; that closes chat and uses the main canvas. Reopening Assistant restores the empty voice view while preserving conversation history. The small back arrow returns to the menu.

Open **gear → Einstellungen → Mit ChatGPT anmelden** for normal browser OAuth through the bundled official Codex runtime. No Claude Code, Device Code, external Hermes gateway or model API key is required. Optional `codex_model` selects a model available to your account. With Home Assistant on another machine, use the return-link form in settings to relay the final localhost redirect URL back to Codex through authenticated Ingress; see [the login guide](../docs/JARVIS.md). Codex owns its persistent credentials under `/data/codex`.

Set `searxng_url` for web/forum search through your JSON-enabled SearXNG; without it search is labeled Wikipedia only. Say/type **Demo** for a clearly labeled local preview. Installation and updates still use this GitHub repository and Home Assistant's locally built add-on.

Assistant explanations use a floating drawing workspace with vector ink, geometric 3D schematics, timelines and source highlights. Say/type **USB Demo** for a labeled, account-free preview. These are schematic visuals; models are not measured simulations.
