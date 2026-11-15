# Jarvis with Codex and normal ChatGPT login

STARK OS 0.2.6 starts with the original menu ring. The ring contains **Media, Gods Eye, Receiver and Assistant**. The bottom-left gear opens settings, source status and Codex sign-in. **Assistant** opens Jarvis on an empty canvas and starts its connection when opened. It uses the pinned official `@openai/codex` package as the model provider for the single Hermes/Jarvis orchestrator. There is no Claude Code dependency. Research and display actions continue through STARK's authenticated tool contract.

## Normal browser sign-in

1. Open the controller through authenticated Home Assistant Ingress, or run the GitHub project locally (`npm ci`, `npm run dev` in `starkos/gods-eye-view`), then open the bottom-left **gear → Einstellungen**.
2. Choose **Mit ChatGPT anmelden**. STARK calls Codex app-server `account/login/start` with `type: chatgpt` and opens its official OpenAI authorization URL. It never requests `chatgptDeviceCode` or falls back to an API key.
3. Sign in with your ChatGPT account. Your account must have Codex access; plan and usage limits apply.

**Local machine:** Codex's official callback is `http://127.0.0.1:1455/auth/callback` (1457 is its fallback). When browser and server run on the same machine, the callback can complete directly and STARK detects the signed-in account.

**Home Assistant / another machine:** localhost in your phone browser refers to your phone, not the add-on. Codex does not expose a custom public callback in this flow. After signing in, if the localhost page cannot open, copy the complete final redirect URL from the browser address bar into **Nach der Browseranmeldung** in STARK. The authenticated controller POSTs it to `/api/stark/jarvis/login/complete`. STARK checks the loopback hostname, original callback port, path, state and expiration before forwarding only code/state to Codex's fixed IPv4 local callback. Both localhost and 127.0.0.1 aliases and a copied loopback address without its http prefix are supported. After callback delivery STARK waits for Codex to confirm the signed-in account instead of assuming it has updated immediately. It never follows a user-supplied external redirect. Alternatively, an SSH tunnel from a local computer to the Codex server's callback port permits a direct return. This add-on does not expose a callback port publicly.

This is ordinary browser OAuth, not Device Code login. A fully automatic one-click remote login is not claimed: without a local callback route the remote step above is necessary. The callback URL contains a short-lived authorization code: submit it only to the authenticated STARK form, never chat, logs or screenshots. The link-entry form is always shown while signed out, before or after starting a login, and remains visible when pending state is missing, Codex is unavailable or the status check fails. It lives only in the menu settings; the Assistant canvas and chat contain no sign-in controls. A valid pending browser flow is still required to accept a callback; an expired flow must be restarted. It clears its input on submission and does not store the link. If the wrong link is pasted or the callback fails, an inline message explains the next step and submission can be retried. The pending expiry is read from Codex on return; focus/visibility events recheck the account status.

Codex owns credentials and refresh in `$STARK_DATA_DIR/codex` (`/data/codex` in Home Assistant). STARK does not read `auth.json`, expose tokens, or use the host's unrelated Codex account. The private app-server transport is stdio. Its filtered environment excludes inherited API keys, tokens, browser commands and a foreign `CODEX_HOME`. **Codex verbunden → Abmelden** signs out. Signing out or starting a new login clears previous conversation histories.

## Configuration and installation

| Home Assistant option | GitHub/local environment | Purpose |
|---|---|---|
| `codex_model` | `STARK_CODEX_MODEL` | Optional model available to your account; blank uses Codex default |
| `searxng_url` | `STARK_SEARXNG_URL` | Optional JSON-enabled SearXNG root for web/forum discovery |

No Codex API key or external Hermes gateway is required. The pinned npm package supplies native packages for amd64 and aarch64. Credentials persist under the mounted `/data` volume. Both real-device architectures still require deployment testing; local Linux browser testing does not certify iPhone/TV or aarch64 behavior.

The original explicitly configured OpenAI-compatible gateway remains opt-in for compatibility/testing: set `STARK_MODEL_PROVIDER=gateway`, `STARK_HERMES_URL` (full chat-completions endpoint), `STARK_HERMES_MODEL`, and optionally `STARK_HERMES_API_KEY`. It is never selected automatically when Codex is signed out or unavailable.

## Conversation and actions

Voice is the default Assistant view. The canvas is empty until needed. Hold the large bottom-center **J** to record; release to send the buffered transcript. Cancelling, leaving the view or losing focus discards the recording. Permission failures show a contextual message. For text chat, hold the small bottom-left handle for 500 ms until it grows, then drag it right and release. A short tap, early drag, left/vertical drag or cancelled gesture does not open chat. Keyboard/screen-reader activation opens it directly. Close through **Sprache** or Escape to restore the voice view. Leaving and reopening Assistant also resets the view to voice without discarding the conversation; no drawer-open state is persisted. Text mode shows the shared in-memory history, silences browser speech and ends microphone capture while open. Typed questions are text-only by default, enforced on the server even if a client asks for visuals. Explicit requests such as “Zeig mir die Quellen”, “Zeichne das” or “Erklär das visuell” permit presentation: when an explanation arrives chat closes and the main canvas shows it. Common spelling such as “visuel” also counts as an explicit visual request. Such turns must successfully execute a presentation before returning a final answer; a text-only diagram triggers up to two corrective model steps within the existing bounded loop. If no presentation succeeds, the UI reports failure instead of showing a text-only substitute as success. Voice turns permit helpful visuals by default. Reopening Assistant clears the canvas without losing conversation history. Browser speech recognition requires permission, a supported browser and HTTPS (localhost also works). Recognition/synthesis may use the browser or OS vendor's service. No background wake word is claimed. Stop/Escape abort the request and interrupt Codex; actions already executed are not rolled back.

Say “weiter”, “zurück”, “bleib hier”, “fortsetzen”, “Fenster schließen”, “ohne Fenster” or “mit Fenstern”. “Öffne Medien”, “Öffne Karte” and “Öffne Receiver” reach the existing modules. The small back arrow preserves the ring. Say/type **Demo** for the fixed, labeled preview without live research or an account.

Codex supplies a structured answer or STARK tool requests under an enforced output schema. Native shell, app/browser control, MCP integrations and delegation are disabled for these completions. The orchestrator validates and executes the supplied STARK tools and returns results to the next model step. Source quotations must match text retrieved in the same conversation. STARK does not repurpose an OAuth token as a generic Chat Completions API key.

`GET /api/stark/jarvis/status` reports Codex account availability and actual search scope without account identifiers/tokens. Login/logout/complete and conversation POST routes remain behind controller authentication and require same-site JSON. `POST /api/stark/jarvis/turn` accepts `{text, conversationId?, visuals?, mode?: 'voice'|'chat'}` and streams newline-delimited events. Histories use random IDs, stay in memory and expire after 30 idle minutes. Time/tool counts are bounded. Prompts and retrieved source text are sent to the selected provider.

## Windows, research and limits

`present_explanation` / `control_explanation` use the authenticated display contract. Empty `display_ids` means the speaking controller; external receivers must be paired, online and advertise `explanation.scenes`. Reload receiver pages after updating to refresh capabilities.

Explanations contain up to 12 timed scenes and three windows each: source excerpts with exact highlights, ordered diagrams, calculation notes or contextual notes. Model-authored HTML/JavaScript is never executed. Desktop shows multiple windows; phones show every window sequentially with larger text. Rotation preserves the conversation. Source links pause the scene; old scenes and the final scene close automatically after reading time.

Without SearXNG, discovery explicitly searches German Wikipedia only. With SearXNG, it covers that instance's configured engines. Public HTTPS articles/forums can be read by URL with DNS validation, pinned addresses, redirect checks and size bounds. Dynamic, login-only or anti-bot pages can fail. Snippets are leads; reading a page is not fact checking. Primary sources, dates, conflicting claims and uncertainty must be compared. Calculation notes are not a certified symbolic engine.

Native drawing over unrelated applications, arbitrary desktop control, dedicated streaming voice audio and full 3D/molecule/quiz rendering are not included.

## Release status

Home Assistant metadata declares `0.2.6`. The change must be merged to the branch consumed by Home Assistant before reloading the store offers the update. A development branch, draft pull request or local patch is not an installed update. Update packages contain application instructions, not credentials.
