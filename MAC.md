# Argus auf dem Mac (Test)

Argus gibt es für macOS als ZIP: `arm64` für Apple-Silicon (M1 bis M4), `x64` für Intel-Macs. Stand: erste Fassung ab Version 0.38, **nicht signiert** und **nicht auf echter Mac-Hardware getestet**. Rückmeldungen sind willkommen (Einstellungen → Fehlerberichte → „Problem melden“).

## Installieren

1. Die ZIP-Datei `Argus-x.y.z-mac-arm64.zip` oder `-x64.zip` bekommst du von Domi (über 100 MB, deshalb nicht in diesem Repo).
2. Entpacken und `Argus.app` in „Programme“ ziehen.
3. Beim ersten Start sperrt macOS die App, weil sie nicht signiert ist. Entweder Rechtsklick auf die App → „Öffnen“ → „Öffnen“, oder im Terminal:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Argus.app
   ```

## Was funktioniert, was nicht

- **Sollte gehen:** Kugel und Panel, KI (Claude, ChatGPT & Co.), Mining-Seite (OCEAN, Foreman), Wetter, Notizen, Freundeslisten.
- **Gibt es dort nicht:** Temperatur- und Lüftermessung (Windows-Messdienst), Prozessliste mit Pfaden, Musik-Anzeige, Aussparung, automatische Updates. Neue Versionen kommen als neue ZIP-Datei.
- **Gaming-Seite:** eingeschränkt, die Spiel-Erkennung ist auf Windows ausgelegt.
