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

See [DOCS.md](DOCS.md) for installation and operation. Current version: **0.2.0**.

The default interface is now a conversation with Jarvis (Hermes), with one microphone control and a contextual Stop. Phones use larger text and show one explanation window at a time. The existing ring remains under **Bereiche**.

In the add-on configuration, set `hermes_url` (full OpenAI-compatible chat-completions endpoint with tool calling), `hermes_model`, and optionally `hermes_api_key`. A running, compatible Hermes deployment is required; it is not bundled. Set `searxng_url` for web/forum search through your JSON-enabled SearXNG; without it search is labeled Wikipedia only. Say/type **Demo** for a clearly labeled local preview. Installation and updates still use this GitHub repository and Home Assistant's locally built add-on.
