# Display adapters and keyless sources

## Display adapters

Only **STARK Receiver** is enabled in this version. `GET /api/stark/adapters` exposes the capability matrix and a reason for every disabled adapter, so the UI cannot pretend an unavailable integration works.

| Adapter | License/account | Current state |
|---|---|---|
| STARK Receiver | local, no account | enabled and tested: media, playback, transforms, transfer, multi-display |
| CATT / Chromecast | BSD-2-Clause, no account | candidate; not installed until a CATT sidecar and real-device tests exist |
| androidtvremote2 | Apache-2.0, no cloud account | candidate; pairing certificate and app/deep-link behavior still need implementation |
| LG webOS | local pairing varies | disabled; no maintained/tested adapter selected |
| Samsung TV | model/Tizen dependent | disabled; no tested capability contract selected |
| MeshCentral | Apache-2.0, self-hosted instance required | optional future computer/file adapter, disabled by default |

Primary references: [CATT](https://github.com/skorokithakis/catt), [androidtvremote2](https://github.com/tronikos/androidtvremote2), [MeshAgent](https://github.com/Ylianst/MeshAgent).

## Free/keyless God's Eye baseline

The supplied engine already implements real fallbacks, so STARK OS preserves them instead of duplicating or faking providers:

| Paid/keyed source | Existing free/no-account path kept active |
|---|---|
| Google Photorealistic 3D / Cesium ion | Esri World Imagery plus Re:Earth terrain; Google/ion remain optional |
| Google geocoding/search | Photon (komoot) |
| Google Street View / Mapillary token | KartaView and Panoramax |
| OpenSky OAuth | adsb.lol fallback for public aircraft data |
| Launch Library token | anonymous LL2 allowance with cache and honest rate limits |
| Google/OpenAI voice | not silently replaced; optional original functions remain configuration-required |
| AISStream live vessels | no equal keyless global live-AIS source selected; remains optional and unavailable without key |
| TomTom live traffic | no semantically equal keyless live-traffic source selected; modeled/static road data is not relabeled live |

Attribution, freshness classes and provider terms remain governed by `starkos/gods-eye-view/DATA_SOURCES.md`.

