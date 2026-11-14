# Jarvis with Codex and normal ChatGPT login

STARK OS 0.2.3 starts with the original menu ring. Its new **Assistant** entry opens Jarvis; **Investigation** remains the original case board. Assistant starts its connection only when opened. It uses the pinned official `@openai/codex` package as the model provider for the single Hermes/Jarvis orchestrator. There is no Claude Code dependency. Research and display actions continue through STARK's authenticated tool contract.

## Normal browser sign-in

1. Open the controller through authenticated Home Assistant Ingress, or run the GitHub project locally (`npm ci`, `npm run dev` in `starkos/gods-eye-view`), then select **Assistant** on the menu ring and double-tap the center.
2. Choose **Mit ChatGPT anmelden**. STARK calls Codex app-server `account/login/start` with `type: chatgpt` and opens its official OpenAI authorization URL. It never requests `chatgptDeviceCode` or falls back to an API key.
3. Sign in with your ChatGPT account. Your account must have Codex access; plan and usage limits apply.

**Local machine:** Codex's official callback is `http://127.0.0.1:1455/auth/callback` (1457 is its fallback). When browser and server run on the same machine, the callback can complete directly and STARK detects the signed-in account.

**Home Assistant / another machine:** localhost in your phone browser refers to your phone, not the add-on. Codex does not expose a custom public callback in this flow. After signing in, if the localhost page cannot open, copy the complete final redirect URL from the browser address bar into **Anmeldung am Handy / anderen Gerät** in STARK. The authenticated controller POSTs it to `/api/stark/jarvis/login/complete`. STARK checks the exact callback origin, path, state and expiration before forwarding only code/state to Codex's fixed local callback. It never follows a user-supplied external redirect. Alternatively, an SSH tunnel from a local computer to the Codex server's callback port permits a direct return. This add-on does not expose a callback port publicly.

This is ordinary browser OAuth, not Device Code login. A fully automatic one-click remote login is not claimed: without a local callback route the remote step above is necessary. The callback URL contains a short-lived authorization code: submit it only to the authenticated STARK form, never chat, logs or screenshots. The form clears its input and does not store it.

Codex owns credentials and refresh in `$STARK_DATA_DIR/codex` (`/data/codex` in Home Assistant). STARK does not read `auth.json`, expose tokens, or use the host's unrelated Codex account. The private app-server transport is stdio. Its filtered environment excludes inherited API keys, tokens, browser commands and a foreign `CODEX_HOME`. **Codex verbunden → Abmelden** signs out. Signing out or starting a new login clears previous conversation histories.

## Configuration and installation

| Home Assistant option | GitHub/local environment | Purpose |
|---|---|---|
| `codex_model` | `STARK_CODEX_MODEL` | Optional model available to your account; blank uses Codex default |
| `searxng_url` | `STARK_SEARXNG_URL` | Optional JSON-enabled SearXNG root for web/forum discovery |

No Codex API key or external Hermes gateway is required. The pinned npm package supplies native packages for amd64 and aarch64. Credentials persist under the mounted `/data` volume. Both real-device architectures still require deployment testing; local Linux browser testing does not certify iPhone/TV or aarch64 behavior.

The original explicitly configured OpenAI-compatible gateway remains opt-in for compatibility/testing: set `STARK_MODEL_PROVIDER=gateway`, `STARK_HERMES_URL` (full chat-completions endpoint), `STARK_HERMES_MODEL`, and optionally `STARK_HERMES_API_KEY`. It is never selected automatically when Codex is signed out or unavailable.

## Conversation and actions

Voice is the default Assistant view. Tap the orb for a spoken turn. For text chat, hold the small bottom-left handle for 500 ms until it grows, then drag it right and release. A short tap, early drag, left/vertical drag or cancelled gesture does not open chat. Keyboard/screen-reader activation opens it directly. Close through **Sprache** or Escape to restore the voice view. Leaving and reopening Assistant also resets the view to voice without discarding the conversation; no drawer-open state is persisted. Text mode shows the shared in-memory history and any active visual explanation, silences browser speech and ends microphone capture while open. Browser speech recognition requires permission, a supported browser and HTTPS (localhost also works). Recognition/synthesis may use the browser or OS vendor's service. No background wake word is claimed. Stop/Escape abort the request and interrupt Codex; actions already executed are not rolled back.

Say “weiter”, “zurück”, “bleib hier”, “fortsetzen”, “Fenster schließen”, “ohne Fenster” or “mit Fenstern”. “Öffne Medien”, “Öffne Karte” and “Öffne Receiver” reach the existing modules. **Bereiche** preserves the ring. Say/type **Demo** for the fixed, labeled preview without live research or an account.

Codex supplies a structured answer or STARK tool requests under an enforced output schema. Native shell, app/browser control, MCP integrations and delegation are disabled for these completions. The orchestrator validates and executes the supplied STARK tools and returns results to the next model step. Source quotations must match text retrieved in the same conversation. STARK does not repurpose an OAuth token as a generic Chat Completions API key.

`GET /api/stark/jarvis/status` reports Codex account availability and actual search scope without account identifiers/tokens. Login/logout/complete and conversation POST routes remain behind controller authentication and require same-site JSON. `POST /api/stark/jarvis/turn` accepts `{text, conversationId?, visuals?}` and streams newline-delimited events. Histories use random IDs, stay in memory and expire after 30 idle minutes. Time/tool counts are bounded. Prompts and retrieved source text are sent to the selected provider.

## Windows, research and limits

`present_explanation` / `control_explanation` use the authenticated display contract. Empty `display_ids` means the speaking controller; external receivers must be paired, online and advertise `explanation.scenes`. Reload receiver pages after updating to refresh capabilities.

Explanations contain up to 12 timed scenes and three windows each: source excerpts with exact highlights, ordered diagrams, calculation notes or contextual notes. Model-authored HTML/JavaScript is never executed. Desktop shows multiple windows; phones show every window sequentially with larger text. Rotation preserves the conversation. Source links pause the scene; old scenes and the final scene close automatically after reading time.

Without SearXNG, discovery explicitly searches German Wikipedia only. With SearXNG, it covers that instance's configured engines. Public HTTPS articles/forums can be read by URL with DNS validation, pinned addresses, redirect checks and size bounds. Dynamic, login-only or anti-bot pages can fail. Snippets are leads; reading a page is not fact checking. Primary sources, dates, conflicting claims and uncertainty must be compared. Calculation notes are not a certified symbolic engine.

Native drawing over unrelated applications, arbitrary desktop control, dedicated streaming voice audio and full 3D/molecule/quiz rendering are not included.

## Release status

Home Assistant metadata declares `0.2.3`. The change must be merged to the branch consumed by Home Assistant before reloading the store offers the update. A development branch, draft pull request or local patch is not an installed update. Update packages contain application instructions, not credentials.
