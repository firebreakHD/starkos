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

See [DOCS.md](DOCS.md) for installation and operation. Current version: **0.2.2**.

The start screen is the original menu ring with Media, Investigation, World, Receiver and System. **Assistant** is a new, separate sixth entry for Jarvis (Hermes), with one microphone control and a contextual Stop. Investigation keeps its case board. Phones use larger text and one explanation window at a time inside Assistant. **Bereiche** returns to the main menu.

Choose **Mit ChatGPT anmelden** for normal browser OAuth through the bundled official Codex runtime. No Claude Code, Device Code, external Hermes gateway or model API key is required. Optional `codex_model` selects a model available to your account. With Home Assistant on another machine, use the optional remote-login form to relay the final localhost redirect URL back to Codex through authenticated Ingress; see [the login guide](../docs/JARVIS.md). Codex owns its persistent credentials under `/data/codex`.

Set `searxng_url` for web/forum search through your JSON-enabled SearXNG; without it search is labeled Wikipedia only. Say/type **Demo** for a clearly labeled local preview. Installation and updates still use this GitHub repository and Home Assistant's locally built add-on.
