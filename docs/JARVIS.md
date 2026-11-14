# Jarvis conversation and visual explanations

STARK OS 0.2.0 adds a speech-first interface to the existing application. Hermes is the only agent. Jarvis is the user-facing persona; this change does not install another autonomous agent or import Roamies code. Existing media/World/receiver controls remain available through **Bereiche** or spoken module commands.

## Connect Hermes

An existing Hermes deployment must expose an OpenAI-compatible **chat completions** endpoint that supports function/tool calling (`messages`, `tools`, assistant `tool_calls`, and tool responses). A plain text-only endpoint or an unrelated Hermes API will not work without an adapter. The configuration is explicit so an unconnected agent cannot look functional.

| Home Assistant option | GitHub/local environment | Value |
|---|---|---|
| `hermes_url` | `STARK_HERMES_URL` | Full endpoint, e.g. `http://your-hermes-host:8000/v1/chat/completions` |
| `hermes_model` | `STARK_HERMES_MODEL` | Deployment/model ID accepted by that endpoint |
| `hermes_api_key` | `STARK_HERMES_API_KEY` | Optional gateway credential; server only |
| `searxng_url` | `STARK_SEARXNG_URL` | Optional SearXNG root, JSON API enabled |

Set these through the Home Assistant add-on options and restart. For local development copy `.env.example` to `.env`, fill the same variables, and run `npm ci` then `npm run dev` in `starkos/gods-eye-view`. Home Assistant Ingress authentication continues protecting the controller, turn API and display tools. LAN access remains passive-receiver-only in add-on mode. Do not expose an unauthenticated Hermes endpoint publicly; keep its credentials in server configuration.

`GET /api/stark/jarvis/status` reports configuration availability (not an unperformed upstream health check) and actual search scope. `POST /api/stark/jarvis/turn` accepts `{text, conversationId?, visuals?}` and streams newline-delimited `conversation`, `tool`, `explanation`, `control`, `answer`, or `error` events. Conversation IDs are random, ephemeral, bounded and expire after 30 idle minutes; histories are not written to disk. A turn has bounded time/tool calls. Closing/cancelling the HTTP request aborts further agent work; actions already executed are not rolled back. Stop also pauses external explanations already reported to the controller.

The gateway receives the conversation and retrieved source text so it can answer. Browser speech recognition and synthesis use browser/OS facilities and may use the browser vendor's service. Input requires user microphone permission and HTTPS (localhost is also secure). Availability varies on iPhone Safari and Home Assistant's embedded browser; text input stays available. No permanent background listening or wake-word service is claimed. Tap the orb for each spoken turn. A visible contextual Stop and Escape remain available for interruption.

## Visual control

Say “weiter”, “zurück”, “bleib hier”, “fortsetzen”, “Fenster schließen”, “ohne Fenster”, or “mit Fenstern”. On phones swipe sideways on the current visual to advance or go back. Opening a source pauses its scene. Text commands use the same path. Say/type **Demo** for the fixed, explicitly labeled demonstration; no research is performed by that preview.

`present_explanation` and `control_explanation` are part of the authenticated display tool contract. Empty `display_ids` means the speaking controller. Named receivers must be paired, online and advertise `explanation.scenes`; rejected commands are reported rather than simulated. Reload existing receiver pages to refresh capabilities after authentication. The receiver itself stays passive: presentation controls remain on the controller. Real TV/iPhone microphone and playback testing is still required; browser validation does not certify every device.

Explanations contain at most 12 scenes and three windows per scene. Supported windows are source excerpts with exact highlights, ordered-node diagrams, calculation notes and contextual notes. Model-authored HTML/JavaScript is never executed. Old scenes close automatically after reading time; the last scene closes at the end. Phone layout presents all windows sequentially rather than hiding extra findings. Desktop and phone share the same conversation/player state; rotating does not start a new conversation. This is a responsive phone presentation, not a separate duplicated application.

## Research scope and limits

With SearXNG configured, source discovery covers the search engines enabled in that instance, including topic-specific sites/forums. Without it, discovery searches German Wikipedia only and both tools and UI say so. `read_source` reads public HTTPS HTML/text pages, checks every redirect, rejects private/reserved DNS destinations and pins the resolved address for the request. Dynamic, login-only, anti-bot or oversized pages can fail; failures remain visible to Hermes and must not be described as successfully read.

Search snippets are leads. Reading a page is not fact checking. The agent is instructed to compare primary sources, freshness, conflicting claims and uncertainty. For source windows inside a conversation the bridge requires an exact excerpt from a page retrieved during that conversation. Calculation windows are explanatory text, not a verified symbolic calculation engine. No guarantee of universally correct information or exhaustive web coverage is made.

This version implements structured in-app diagrams and excerpts. Native desktop drawing, control of arbitrary apps, 3D/molecule/quiz renderers, dedicated streaming speech-to-speech audio and additional TV adapters are not included. Those require further native/runtime integrations; the existing capability boundary must not pretend they are available.

## Home Assistant release

Version `0.2.0` is declared in `starkos/config.yaml` and both READMEs, with release notes in `starkos/CHANGELOG.md`. Once the change is merged/pushed to the repository branch consumed by Home Assistant, reload the add-on store repository and install the offered update. No new port or image registry is needed. A draft PR branch alone is not an installed update.
