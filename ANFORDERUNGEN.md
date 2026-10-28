# Anforderungen Argus

Dokumentversion: 1.0 · gilt ab Argus 0.58.20

| Dok.-Version | Argus | Änderung |
|---|---|---|
| 1.0 | 0.58.20 | Erste Fassung: Sicherheits-Hotfix Selbstverbesserung |

| ID | Anforderung | Tests | seit | Status |
|---|---|---|---|---|
| R-SELF-1 | Claude Code darf nur auf seinen isolierten Arbeitsordner zugreifen, technisch erzwungen. Voraussetzung jeder Wiedereinschaltung der Selbstverbesserung. | eigener Plan | – | offen |
| R-SELF-2 | Bis R-SELF-1 nachgewiesen ist, bleibt die Selbstverbesserung abgeschaltet. Wiedereinschalten nur durch eine neue Version, nie über Konfiguration, Umgebungsvariable oder Nutzereingabe. | `tests/hotfix.test.js` (T6, T9) | 0.58.20 | aktiv |
| R-SELF-3 | `selfimprove-pending.json` wird von keinem Selbstverbesserungs- oder Startpfad mehr ausgewertet, verändert oder gelöscht und von den automatischen Abläufen (Start, Profilumzug, Dateiverzeichnis, Suche) weder kopiert noch gelistet. **Ausgenommen** sind direkte Dateizugriffe mit Pfadangabe; für sie gilt nur die begrenzte Sperre aus R-FILE-1 mit ihren bekannten Grenzen. | T8, T9, T10, T11, T12 | 0.58.20 | aktiv |
| R-SELF-4 | Inhalte aus Arbeits-, Archiv- und Sicherungsordnern der Selbstverbesserung werden von automatischen Abläufen (Start, Profilumzug, Dateiverzeichnis, Suche einschließlich der Dateisuche in `actions.js`) weder gelesen, kopiert, geladen noch ausgeführt; sie erscheinen nicht in Suchtreffern und werden über Suchbefehle nicht geöffnet. Ausgenommen wie bei R-SELF-3: direkte Dateizugriffe mit Pfadangabe (R-FILE-1). | T10, T11, T12, T14 | 0.58.20 | aktiv |
| R-FILE-1 | Direkte Dateizugriffe mit Pfadangabe (KI-Werkzeug `datei_lesen`) lehnen Argus-Profilordner und Daten der Selbstverbesserung ab. **Begrenzt:** Erkennung nur über den angegebenen Pfad; Junctions, symbolische Verknüpfungen, 8.3-Kurznamen und andere Windows-Pfadformen sind nicht abgedeckt. Vollständige Absicherung mit robuster Pfadauflösung folgt in einem eigenen Hotfix. | T13 | 0.58.20 | teilweise |
