# Argus

Desktop-Assistent für Windows (Neuronen-Kugel mit Sprachsteuerung, Systemwache und KI). Hieß früher Jarvis.

## Installieren

1. Im Zweig [`updates`](https://github.com/d0mm392/Argus/tree/updates) die Datei `Argus-Setup-x.y.z.exe` öffnen und auf „Download raw file“ klicken.
2. Setup starten. Windows SmartScreen warnt, weil das Setup nicht signiert ist: „Weitere Informationen“ → „Trotzdem ausführen“.
3. Beim ersten Start fragt Argus nach deinem Namen, der KI und den gewünschten Anzeigen. Alles lässt sich später unter Einstellungen ändern.

Für Antworten von Claude braucht Argus [Claude Code](https://claude.com/download) mit deinem eigenen Claude-Konto. Ohne Claude Code nutzt Argus eine lokale KI (Ollama), die es auf Wunsch selbst einrichtet.

## Updates

Ein installiertes Argus prüft beim Start und alle 4 Stunden den Zweig `updates` und aktualisiert sich selbst. Installationen, die noch Jarvis heißen, ziehen beim nächsten Update automatisch um (Datenordner wird kopiert, der alte bleibt als Sicherung).

Deine Einstellungen, Schlüssel und das Gedächtnis liegen nur auf deinem PC, nicht in diesem Repo.
