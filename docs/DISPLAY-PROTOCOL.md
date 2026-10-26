# STARK Display Protocol 1

Protocol identifier: `stark-display/1`. Transport: same-origin WebSocket at `/api/stark/ws`; REST is used only for controller commands and the confirmed pairing ceremony.

## Pairing

1. An authenticated controller creates a six-digit, five-minute code.
2. The receiver submits the code, display name and declared capabilities.
3. The controller shows a pending request. A user must explicitly confirm it.
4. The receiver polls with a random claim secret in the POST body. After approval it receives a random 256-bit device token once through that authenticated claim.
5. The server persists only the SHA-256 hash. The raw token is not used in a URL or log and can be revoked.

## WebSocket

The receiver's first message must be:

```json
{"v":1,"protocol":"stark-display/1","type":"receiver.auth","deviceId":"…","token":"…"}
```

The server answers `receiver.ready` with persisted desired state. Commands use `type: command` and include a random command ID, session ID and expiry. Receivers answer with `command.ack` and actual state. On reconnect the receiver reports its actual state again; the controller shows `connected`, `state.status` and `state.current` from the server.

Media grants last two hours. Receiver code rejects an expired command. In-memory media sessions are deliberately not revived after a server restart; devices reconnect in standby instead of receiving stale content.

## Actions and capabilities

| Action | Capability |
|---|---|
| show image/video/PDF/web link | `media.image`, `media.video`, `media.pdf`, `media.web` |
| transfer a file | `file.transfer` |
| pause/resume | `playback.pause` |
| seek / volume / next / previous | matching `playback.*` capability |
| zoom/move/rotate/reset image | `image.transform` |
| end presentation | always available for a paired online receiver |

Unsupported commands return an explicit rejected result and are disabled in the controller.

## Hermes tool interface

`GET /api/stark/tools` returns JSON-schema definitions. `POST /api/stark/tools` accepts:

```json
{"tool":"list_displays","arguments":{}}
```

Tools: `list_displays`, `show_media`, `control_playback`, `transform_image`, `move_content`, and `end_session`. They call the same `DisplayService` as the UI and therefore use the same pairing, capability and online-state checks. The endpoints are protected by Home Assistant Ingress or the direct-access session cookie; Hermes must call them through that authorized local integration rather than receiving a bypass token.

