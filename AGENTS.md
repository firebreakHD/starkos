# STARK OS project boundaries

- The Home Assistant app lives in `starkos/`; `starkos/gods-eye-view/` is the provided upstream engine plus narrowly scoped STARK integration files.
- Preserve God's Eye View data-source labels, attribution, security checks and keyless fallbacks. Never relabel delayed, modeled or unavailable data as live.
- STARK OS is a research/media interface, not a Home Assistant dashboard. Do not add smart-home controls.
- Hermes is the only agent. New automation capabilities must use the authenticated STARK display tool contract; do not add a second agent.
- A display adapter is enabled only after its pairing, capability detection and commands work on real hardware. Unsupported actions remain disabled and carry a reason.
- Direct LAN access requires `access_password`; Home Assistant Ingress trusts only the Supervisor address. Never put device tokens in URLs or logs.
- Keep mobile Safari gestures working: single tap previews, double tap sends, and drag-to-target must remain distinct.
- Do not commit API keys, receiver tokens, `.env`, `/data`, caches or logs.

