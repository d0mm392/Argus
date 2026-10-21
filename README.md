# Jarvis Desktop (Windows)

Eine kleine Kugel, die immer im Vordergrund in einer Bildschirmecke hängt und zeigt, was die KI gerade tut. Sie reagiert auf „Hallo Claude“.

## Starten

1. `Jarvis-0.1.0-portable.exe` an einen festen Ort legen (z. B. `C:\Tools\Jarvis\`) und doppelklicken.
2. Windows SmartScreen warnt, weil die Datei nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.
3. Beim ersten Start lädt Jarvis einmalig das deutsche Sprachmodell (ca. 45 MB). Danach läuft die Spracherkennung komplett offline.
4. Windows fragt eventuell nach Mikrofonzugriff. Unter *Einstellungen → Datenschutz → Mikrofon* muss „Desktop-Apps den Zugriff erlauben“ an sein.

## Bedienen

| Was | Wie |
|---|---|
| Groß / klein | Strg+Umschalt+J, oder über die Kugel fahren und auf den Pfeil klicken |
| Verschieben | Kugel mit der Maus ziehen. Sie merkt sich die nächste Ecke. |
| Ecke, Autostart, Beenden | Rechtsklick auf das Kugel-Symbol im Infobereich der Taskleiste |
| Mikrofon an/aus | Mikrofon-Knopf (beim Überfahren der Kugel oder unten im großen Modus) |
| Sprechen | „Hallo Claude“ sagen, dann die Frage. Oder beides in einem Satz. |
| Schreiben | Im großen Modus unten ins Feld tippen, Enter |

Bei einer Frage klappt das Fenster von selbst auf und geht 12 Sekunden nach der Antwort wieder zu, solange du nicht hineinklickst.

## KI einrichten

Ohne Einrichtung läuft Jarvis im Demo-Modus. Über das Zahnrad (großer Modus) oder das Taskleisten-Menü öffnest du `jarvis-config.json`:

- **Claude:** `"anthropicApiKey": "sk-ant-..."` eintragen. Den Key gibt es auf platform.claude.com. Achtung: Die API wird separat nach Verbrauch abgerechnet und ist nicht in einem Claude-Pro/Max-Abo enthalten.
- **Lokale KI:** [Ollama](https://ollama.com) installieren, z. B. `ollama pull llama3.2` ausführen. Jarvis findet Ollama automatisch, wenn kein API-Key eingetragen ist. Mit `"ollamaModel"` legst du ein bestimmtes Modell fest.
- `"backend"`: `"auto"` (Claude vor Ollama), `"claude"` oder `"ollama"`.
- `"claudeModel"` / `"effort"`: Standard ist `claude-opus-5-5` mit `low` für schnelle Antworten.
- `"wakeWords"`: Liste der Auslöser. „claude“ wird tolerant erkannt (klaut, cloud, …).

Nach Änderungen im Taskleisten-Menü **Einstellungen neu laden** klicken.

## Grenzen

- Die Animation stellt die Arbeitsschritte dar, sie misst keine echte Aktivität im Modell.
- Das kleine Vosk-Sprachmodell versteht Deutsch ordentlich, aber nicht perfekt. Im großen Modus zeigt das Protokoll unter „Gehört: …“, was es verstanden hat.
- Die Sprachausgabe nutzt die Windows-Stimmen. Für eine deutsche Stimme muss das deutsche Sprachpaket installiert sein.

## Aus dem Quellcode starten

```
npm install
npm start           # App starten
npm run dist        # Windows-.exe nach dist/ bauen
```
