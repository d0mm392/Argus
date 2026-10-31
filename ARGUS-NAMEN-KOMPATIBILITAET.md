# Argus-Namen und Altkennungen (0.58.28)

Inventar: alle versionierten Pfade und Textdateien wurden ohne Beachtung der Groß-/Kleinschreibung auf `Jarvis` geprüft. 67 Dateien enthielten Fundstellen, kein versionierter Datei- oder Ordnername enthält Jarvis. Das vollständige Inventar mit Zeilennummern und die Sicherung der geänderten Dateien liegen lokal unter `.avatar-fix`. Diagnosepakete, frühere Builds, Sicherungen, Testnachweise, Git-Historie und Nutzerdateien bleiben erhalten. Es wurden keine nachweislich unbenötigten Projektdateien gefunden und keine Dateien gelöscht.

## Bereinigt

- Renderer-Schnittstelle `window.jarvis` → `window.argus`, einschließlich sämtlicher aktiver Aufrufer und ausführbarer Tests. Die Oberfläche lädt die Module weiterhin über die bestehenden Script-Verweise; kein dynamisch geladenes Modul wird entfernt.
- Interne Namen `callJarvis`, `JARVIS_TOOLS`, `jarvisUrl`, temporäre TTS-Dateinamen und die Sensor-Hilfsklasse heißen jetzt Argus. Die Discord-Bot-Gerätekennung und die vom Sensor gelieferten Titel lauten Argus.
- Produktname, Installer, Deinstallation, Verknüpfungen, Tray und sichtbare Sprachoption heißen bereits Argus. Kommentare zu heutigen Komponenten wurden angepasst.

## Gezielte Kompatibilitätsausnahmen

| Altkennung | Grund für Beibehaltung |
| --- | --- |
| `de.jarvis.desktop` (Build und AppUserModelId) | NSIS-Installations-/Registry-Identität und Windows-Zuordnung. Ein Wechsel könnte parallele Installationen, falsche Deinstallation oder verlorene Verknüpfungen erzeugen. |
| `jarvis-desktop`, `Jarvis`, `jarvis-config.json`, `jarvis-error.log`, `.umzug-von-jarvis.json`, `Jarvis-Gedaechtnis` | Lesen und Migration vorhandener Profile. Alte Daten werden bei fehlgeschlagener Migration weiter benutzt. Ein bereits bestehendes Argus-Profil hat Vorrang, auch ohne historischen Marker. |
| `Jarvis-Sensoren`, Aufgabe `Jarvis Sensoren` | Bereits eingerichteter privilegierter Sensor-Dienst. Keine stille Neuerstellung oder Änderung einer Aufgabe auf dem Nutzerrechner. Setup, Start und Ende benutzen weiterhin dieselbe Kennung. |
| `JARVIS_*`, `X-Jarvis-Token` | Bestehende Umgebungsvariablen und lokale MCP-/Werkzeug-Verbindungen; beide Protokollenden bleiben kompatibel. |
| gespeicherter Wert `voiceEngine: "jarvis"` und HTML-Optionswert | Gespeicherte Piper-Sprachwahl; sichtbare Bezeichnung ist Argus. |
| `jarvisSetOpen`, `jarvisSetTab`, `jarvisProcsAll`, `jarvisMineAll`, `jarvisFarmAll`, `jarvisShapesClosed` | Vorhandene lokale Oberflächeneinstellungen. |
| Export-Metadatum `jarvis` | Bestehendes JSON-Exportformat. Import übernimmt weiterhin dieselben erlaubten Einstellungen. |
| frühere Repository-URL `d0mm392/jarvis/updates` | Historischer Updater-Rückfall und Erkennung alter benutzerdefinierter URLs. Primärquelle bleibt Argus. |
| Jarvis in Prozess-/Profil-Schutzregeln und Sprachparsern | Schutz alter Profile und Prozesse sowie Verständnis bisheriger Anreden. |
| Historische Hinweise, Tests für Altdaten, Gedächtnisverweis `jarvis-release` | Dokumentieren reale frühere Bezeichnungen; keine Nutzer-Gedächtnisdatei wird umbenannt oder gelöscht. |

Autostart verwendet weiterhin Electrons bestehende Login-Item-Verwaltung; Profilname `argus-desktop`, Datenpfade, NSIS-Schlüssel, Installationsziel, Shortcut-Namen und Updater-Kanal bleiben kompatibel. Die installierte Host-Anwendung wird nicht zum Testen gestartet oder verändert. Installationsprüfungen erfolgen ausschließlich in der Test-VM.
