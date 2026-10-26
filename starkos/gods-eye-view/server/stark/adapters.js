// Capability registry only. An adapter is enabled only when its actual runtime
// and pairing flow exist; this prevents UI buttons from implying support.
export const DISPLAY_ADAPTERS = Object.freeze([
  {
    id: 'stark-receiver',
    name: 'STARK Receiver',
    enabled: true,
    license: 'STARK OS project license',
    accountRequired: false,
    capabilities: [
      'media.image',
      'media.video',
      'media.pdf',
      'media.web',
      'playback.pause',
      'playback.seek',
      'playback.volume',
      'playback.queue',
      'image.transform',
      'file.transfer',
    ],
  },
  {
    id: 'chromecast-catt',
    name: 'Chromecast (CATT)',
    enabled: false,
    license: 'BSD-2-Clause',
    accountRequired: false,
    capabilities: [
      'media.image',
      'media.video',
      'media.web',
      'playback.pause',
      'playback.seek',
      'playback.volume',
    ],
    unavailableReason:
      'CATT-Sidecar und gerätespezifischer Integrationstest sind noch nicht installiert.',
  },
  {
    id: 'android-tv-remote',
    name: 'Android / Google TV Remote',
    enabled: false,
    license: 'Apache-2.0',
    accountRequired: false,
    capabilities: ['media.web', 'playback.pause', 'playback.volume'],
    unavailableReason:
      'Remote-v2-Zertifikatspairing und Deep-Link-Adapter sind noch nicht installiert.',
  },
  {
    id: 'lg-webos',
    name: 'LG webOS',
    enabled: false,
    accountRequired: false,
    capabilities: [],
    unavailableReason:
      'Kein gepflegter, getesteter Adapter im Add-on vorhanden.',
  },
  {
    id: 'samsung-tv',
    name: 'Samsung TV',
    enabled: false,
    accountRequired: false,
    capabilities: [],
    unavailableReason:
      'Unterstützung ist modell- und Tizen-versionsabhängig; kein getesteter Adapter vorhanden.',
  },
  {
    id: 'meshcentral',
    name: 'Computer via MeshCentral',
    enabled: false,
    license: 'Apache-2.0',
    accountRequired: false,
    capabilities: ['file.transfer'],
    unavailableReason:
      'Benötigt eine vorhandene eigene MeshCentral-Instanz und explizite Zugangskonfiguration.',
  },
  {
    id: 'webrtc-capture',
    name: 'Bildschirm- / Fensterübertragung',
    enabled: false,
    accountRequired: false,
    capabilities: ['screen.capture'],
    unavailableReason:
      'Sicheres Signaling und explizite Browser-Freigabe sind noch nicht implementiert.',
  },
]);
