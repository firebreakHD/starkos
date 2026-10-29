# STARK OS project boundaries

- The Home Assistant app lives in `starkos/`; `starkos/gods-eye-view/` is the provided upstream engine plus narrowly scoped STARK integration files.
- Preserve God's Eye View data-source labels, attribution, security checks and keyless fallbacks. Never relabel delayed, modeled or unavailable data as live.
- STARK OS is a research/media interface, not a Home Assistant dashboard. Do not add smart-home controls.
- Hermes is the only agent. New automation capabilities must use the authenticated STARK display tool contract; do not add a second agent.
- A display adapter is enabled only after its pairing, capability detection and commands work on real hardware. Unsupported actions remain disabled and carry a reason.
- The phone controller uses authenticated Home Assistant Ingress and trusts only the Supervisor address. Direct LAN routes are limited to passive receivers; never put device tokens in URLs or logs.
- Keep mobile Safari gestures working: single tap previews, double tap sends, and drag-to-target must remain distinct.
- Do not commit API keys, receiver tokens, `.env`, `/data`, caches or logs.

## Shipping a change to Home Assistant

Home Assistant decides whether an update exists by comparing one value: `version:` in `starkos/config.yaml`. It does not look at commits, file contents or dates. A pushed change with an unchanged version is invisible in the add-on store — the installed add-on keeps running the old build and nothing in the interface says why.

Therefore every change that ships inside the add-on image — anything under `starkos/`, including `starkos/gods-eye-view/` — raises the version in the same commit as the code:

1. Raise `version:` in `starkos/config.yaml` using semantic versioning.
2. Add the release notes for that version to the top of `starkos/CHANGELOG.md`, describing what changed for the user.
3. Update the version line in `README.md` ("Current Home Assistant app version") and in `starkos/README.md`.

Changes that cannot reach the running app need no bump: `docs/`, the root `AGENTS.md`, CI workflow files and tests that ship with nothing.

A task-specific instruction not to touch build, port or deployment settings does **not** exempt the version bump, because without it the delivered work never reaches the device. When such an instruction appears to forbid it, raise the conflict and ask rather than shipping an update nobody can install.

After pushing, the user reloads the repository in Home Assistant (Settings → Add-ons → Add-on Store → ⋮ → Reload). The add-on then rebuilds the checked-in Dockerfile locally. A matching Git tag, for example `v0.1.9`, is optional.
