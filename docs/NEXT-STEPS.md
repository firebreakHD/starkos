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
- WebDAV ist implementiert. SMB/CIFS folgt erst nach Auswahl einer gepflegten Bibliothek und echtem Hardwaretest; NFS nur mit den tatsächlich verfügbaren Optionen und ohne vorgetäuschte Benutzer-/Passwortanmeldung.
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

## Danach

- Chromecast/CATT, Android TV Remote, LG webOS, Samsung und MeshCentral nur mit real getesteten Fähigkeiten ergänzen.
