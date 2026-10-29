# STARK OS – nächster Arbeitsblock

## Erledigt: Pairing und Steuerung ausschließlich vom Handy

- Der Receiver öffnet nur eine passive Bereitschaftsansicht und meldet sich als verfügbares Display am STARK-OS-Server.
- Am Receiver gibt es weder Kopplungscode noch Connect-, Bestätigungs- oder Steuerknöpfe.
- Nur der authentifizierte Handy-Controller zeigt verfügbare, noch nicht gekoppelte Displays an.
- **CONNECT** kann ausschließlich am Handy ausgelöst und bestätigt werden.
- Beim Verbinden vergibt der Benutzer am Handy einen eigenen Namen pro Display.
- Gekoppelte Displays können später am Handy umbenannt und widerrufen werden.
- Der Receiver bleibt eine reine Ausgabeoberfläche. Zoom, Position, Rotation, Reset, Pause, Fortsetzen, Spulen, Lautstärke sowie nächstes/vorheriges Medium werden ausschließlich vom Handy gesendet.
- Passive Erkennung darf die Sicherheit nicht schwächen: nur der Controller darf einen dauerhaften, widerrufbaren Gerätezugang ausstellen.
- Unbestätigte Receiver-Anfragen laufen automatisch ab und erhalten keine Medien- oder Steuerberechtigung.

## Abnahmetests

1. Frischer Receiver erscheint ohne Code am Handy als verfügbar.
2. Ohne Aktion am Handy kann der Receiver nicht gekoppelt werden.
3. Am Handy **CONNECT** drücken, eigenen Namen vergeben und Verbindung bestätigen.
4. Bild senden und ausschließlich am Handy zoomen, verschieben, drehen und zurücksetzen.
5. Video senden und ausschließlich am Handy pausieren, fortsetzen, spulen und Lautstärke ändern.
6. Zwei Receiver mit unterschiedlichen Namen verbinden und unabhängig steuern.
7. Receiver neu laden: Verbindung und eigener Name bleiben erhalten.
8. Zugang am Handy widerrufen: Receiver kann sich nicht erneut authentifizieren.
9. Unbestätigte und abgelaufene Anfragen können keine Befehle oder Medien abrufen.

## Teilweise erledigt: Medienbrowser und NAS-Quellen

- Das derzeit große Feld **Medium einspeisen** durch eine kompakte Import-Schaltfläche ersetzen, damit auf dem Handy mehr Platz für den eigentlichen Medienbrowser bleibt.
- Im Medienbrowser eine eigene Einstellungsansicht **Medienquellen** ergänzen.
- NAS-Freigaben mit frei wählbarem Namen, Freigabeadresse/Pfad, Protokoll, Benutzername und Passwort hinzufügen, bearbeiten, testen und entfernen können.
- WebDAV und SMB sind implementiert. SMB läuft über `smb3-client` (SMB 2.1 bis 3.1.1, NTLMv2, Signing, Verschlüsselung) und ist noch nicht an echter NAS-Hardware bestätigt. NFS nur mit den tatsächlich verfügbaren Optionen und ohne vorgetäuschte Benutzer-/Passwortanmeldung.

#### Umgesetzt: SMB-Quellen (29.10.2026)

Node bringt keinen SMB-Client mit, und SMB ist an drei Stellen gesperrt: die deaktivierte Option im Quellenformular (`public/stark/index.html`), die Ablehnung jedes Typs außer `webdav` in der Route `POST /api/stark/media-sources` (`server/stark/receiver.js`) und der Store selbst, der `type` hart auf `webdav` setzt, nur `http(s)` erlaubt und allein `browseWebDav`/`fetchWebDavFile` kennt (`server/stark/media-source-store.js`). Die Option freizuschalten genügt also nicht.

Geprüfte Pakete:

| Paket | Stand | Bewertung |
|---|---|---|
| `smb3-client` 0.2.0 | 16.05.2026, MIT, keine Laufzeitabhängigkeiten, pure ESM, Node ≥ 20 | Einziger Kandidat mit echtem SMB 3.x (2.1–3.1.1, NTLMv2, Signing, Verschlüsselung). Vom Autor als Alpha gekennzeichnet und nur gegen Windows-Server getestet, nicht gegen Samba-NAS. |
| `@marsaud/smb2` 0.18.0 | 12.04.2021 | SMB2; scheitert an Freigaben, die SMB3 erzwingen. |
| `node-smbx` 0.3.0 | 23.03.2026 | Natives libsmb2-Binding; benötigt eine Build-Kette im Add-on-Image für amd64 und aarch64. |
| `samba-client` 7.2.0 | 15.04.2023 | Wrapper um das `smbclient`-Binary; erfordert eine zusätzliche Systemabhängigkeit im Dockerfile. |

Gegen Samba-Freigaben (Synology, QNAP, OpenMediaVault) hängt `smb3-client` 0.2.0 Füllbytes hinter den letzten Negotiate-Kontext; Samba prüft die Länge und lehnt die gesamte Aushandlung mit STATUS_INVALID_PARAMETER ab, noch vor jeder Anmeldung. Gemessen am NAS: 112 Byte abgelehnt, dieselbe Anfrage auf 108 Byte gekürzt angenommen (Dialekt 0x311). Zweiter Defekt derselben Art: beim Blättern durch ein großes Verzeichnis sendet die Bibliothek kein Suchmuster, meldet aber weiterhin FileNameOffset 96; MS-SMB2 §2.2.33 verlangt dort 0, Samba antwortet mit STATUS_OBJECT_NAME_INVALID. `scripts/patch-smb3-client.mjs` korrigiert beide Anfragen beim Installieren, `server/stark/smb-requests.test.mjs` schlägt fehl, falls sie zurückkommen. Das Skript entfällt, sobald der Fehler upstream behoben ist.

Umgesetzt mit `smb3-client`, exakt auf 0.2.0 gepinnt: Transport hinter `browseSource`/`readSourceFile`, Pfadprüfung in `smbTarget()` gegen `..`, Backslashes und Laufwerksbuchstaben, NT-Statuscodes werden in HTTP-Status übersetzt. Offen bleibt der Test an echter NAS-Hardware; die Alpha-Kennzeichnung der Bibliothek bleibt bestehen.

- Verbindungsstatus und verständliche Fehler anzeigen, ohne Zugangsdaten offenzulegen.
- Passwörter ausschließlich serverseitig persistent und geschützt speichern; nie in URLs, Logs, Browser-LocalStorage oder Receiver-Nachrichten übertragen.
- NAS-Verzeichnisse mobil durchsuchen, unterstützte Bilder/Videos/Dokumente öffnen und direkt an ausgewählte Displays senden.
- Medien nur über kurzlebige, sitzungsgebundene Freigaben an gekoppelte Receiver ausliefern; der Receiver erhält niemals NAS-Zugangsdaten.
- Lokale Datei-Auswahl und Drag-and-drop als kleine zusätzliche Importfunktion erhalten.

### NAS-Abnahmetests

1. NAS-Quelle am Handy anlegen und Verbindung testen.
2. Falsche Zugangsdaten ergeben eine verständliche Meldung ohne Passwort in Antwort oder Log.
3. Ordner und unterstützte Medien auf dem iPhone durchsuchen.
4. NAS-Bild öffnen und an einen Receiver senden; Zoom bleibt am Handy.
5. NAS-Video senden und vom Handy steuern.
6. Abgelaufene Medienfreigabe kann vom Receiver nicht erneut geladen werden.
7. Quelle entfernen und prüfen, dass gespeicherte Zugangsdaten gelöscht werden.

## Verbindlich: adaptiver Media Browser in Portrait und Landscape

Diese Vorgabe ersetzt jede frühere Einschränkung auf ausschließliche Querformat-Bedienung. Es gibt genau **einen** Media Browser und einen gemeinsamen Laufzeitzustand; Portrait und Landscape sind ausschließlich unterschiedliche responsive Darstellungen desselben Zustands.

### Gemeinsame Architektur

- Medien-/NAS-Daten, Ordnerauswahl, aktuelles Bild, Bildtransform, Receiver-Auswahl, laufende Sitzung und Übertragungsstatus werden außerhalb der Layoutdarstellung gehalten.
- Wheel- und Gestenlogik werden einmal implementiert und von beiden Layouts verwendet. Ein Orientierungswechsel darf keine zweite Browserinstanz erzeugen.
- CSS Media Queries steuern die Anordnung; `matchMedia('(orientation: landscape)')` darf nur für notwendige Messungen und Fokuskorrekturen verwendet werden.
- Beim Drehen bleiben NAS-Pfad, geladener Ordner, Bildindex, Zoom/Pan/Rotation, ausgewählte Receiver und aktive Präsentationen unverändert.
- Kein Reload, kein erneuter NAS-Abruf und kein Neuaufbau großer Bilddaten allein aufgrund eines Layoutwechsels.
- Wheel-Updates laufen über `requestAnimationFrame`; Bildtransformationen verwenden `transform`/GPU-Komposition und verändern nicht fortlaufend das Dokumentlayout.

### Landscape – Modus A: NAS-Ordnerauswahl

- Linke Hälfte: ausgewählter Ordnername prominent auf Höhe der Wheel-Mitte, darunter dezente Metadaten wie Anzahl unterstützter Medien; keine klassischen Ordnerkacheln.
- Rechte Hälfte: großes vertikal zentriertes STARK-Wheel für Ordnernavigation, darunter ein optisch verbundenes rechteckiges **LOAD**-Element.
- Wheel-Bewegung aktualisiert den Ordnernamen links flüssig. Erst Doppeltipp/-druck auf **LOAD** lädt den Ordner.

### Landscape – Modus B: geladener Fotoordner

- Linke Hälfte: große Vorschau des aktiven Bildes mit Pinch-Zoom, Pan und Pinch-to-Transmit. Nach dem Senden bleiben Zoom und Pan mit den ausgewählten Receivern synchronisiert.
- Rechte Hälfte: dasselbe Wheel navigiert dauerhaft durch die Bilder. Links/rechts daneben liegen Vorheriges-/Nächstes-Tasten.
- Eine gut erreichbare Zurück-/Abbruchfunktion oben wechselt zur Ordnerauswahl, ohne NAS-Quelle oder Receiver-Sitzung zu verlieren.

### Portrait

- Eigene platzsparende Anordnung auf Basis desselben DOM-/Zustandsmodells, nicht eine zweite Smartphone- oder Fernseheransicht.
- Wheel skaliert für die schmale Breite; LOAD beziehungsweise Vor/Zurück bleiben direkt am Wheel und im Daumenbereich.
- Ordnername beziehungsweise Bildvorschau erhält den verbleibenden Hauptbereich. Bedienelemente dürfen Pinch-Zoom und Pan nicht verdecken.
- Funktionsumfang entspricht Landscape vollständig: Ordnerwahl, Doppeltipp-LOAD, Bildnavigation, Vorschaugesten, Übertragung und Receiver-Synchronisierung.

### Orientierungs- und Geräteabnahme

1. Im Portrait NAS-Quelle und Unterordner auswählen, ins Landscape drehen: Pfad und Wheel-Auswahl bleiben identisch.
2. Foto laden, zoomen und verschieben, mehrfach zwischen Portrait/Landscape drehen: Bildindex und Transform bleiben exakt erhalten.
3. Während einer laufenden Receiver-Präsentation drehen: keine Unterbrechung, kein erneutes Senden und keine neue Sitzung.
4. Nach dem Drehen funktionieren Single Tap, Double Tap, Drag, Pinch und Pan weiterhin unterscheidbar.
5. Zwei Receiver bleiben ausgewählt und zeigen weiterhin ihre jeweiligen Inhalte.
6. iPhone Safari und Home-Screen-Web-App in beiden Orientierungen inklusive Safe Areas und Browserleisten testen.
7. Große Bilder wechseln und drehen ohne sichtbares Flackern, unnötigen NAS-Neuabruf oder Wheel-Ruckeln.

## Danach

- Chromecast/CATT, Android TV Remote, LG webOS, Samsung und MeshCentral nur mit real getesteten Fähigkeiten ergänzen.
