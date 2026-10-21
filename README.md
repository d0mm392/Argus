# Argus

Desktop-Assistent: eine animierte Neuronen-Kugel (Kugel, Hexagon, Würfel, Gehirn und mehr) als Statusanzeige und Zugang zu einer KI, dazu Systemwache, Mining-Überblick und Gaming-Seite. Läuft als schlankes Widget in einer Bildschirmecke oder als frei anordenbares Panel.

Aktuelle Version: **0.51.5** · Lizenz: **GPL-3.0** · Quellcode: Zweig [`source`](https://github.com/d0mm392/Argus/tree/source)

## Was Argus kann

- **KI:** Claude (über [Claude Code](https://claude.com/download) mit eigenem Konto oder per API-Schlüssel), ChatGPT, Gemini, Mistral, Groq, OpenRouter oder ein eigener OpenAI-kompatibler Server, außerdem lokale Modelle (Ollama, Strata). Spracheingabe mit „Hallo Claude“, Gedächtnis, einfache Aktionen (Programme öffnen, Dateien suchen).
- **System:** CPU, GPU, RAM, Netz, Laufwerke, Temperaturen und Lüfter, Prozessliste, Warnungen (Temperaturmessung nur unter Windows).
- **Mining:** OCEAN-Pool, Foreman-Farmüberwachung, Bitcoin-Netzdaten, täglicher Miner-Report (14 Tage gespeichert), Benachrichtigungen. Alles optional. Es läuft kein Miner in Argus.
- **Gaming-Seite:** erkennt das laufende Spiel (Steam, Epic, GOG, EA, Ubisoft, Battle.net, Riot, Xbox), zeigt Infos, News und Tipps. Es wird nichts im Spiel gelesen oder eingeklinkt.
- **Freunde und Medien:** Steam- und Discord-Freundeslisten, YouTube und Musik-Player im Panel, Fenster-Spiegel, Notizblock.
- **Anpassung:** drei Seiten (Start, Mining, Gaming) mit jeweils eigener Anordnung, Kugel und Anzeigen. Alle Fenster frei verschieb- und skalierbar, Skins, 16 Farbwelten plus eigene Farben, 14 Formen als 3D-Körper (inkl. 3D-Symbiont), viele Hintergründe mit frei wählbarer Farbe, Button-Formen und -Materialien (Glas, Neon, Relief …), einklappbare Blöcke, Verlauf der Messwerte per Klick, Schriftarten, Struktur der Formen, Rechtsklick-Menü im Argus-Stil (Deckkraft einstellbar).
- **Fehlerberichte:** gehen nur mit deiner Zustimmung raus, vorher werden Name, Pfade, Schlüssel und Wallet-Adressen entfernt. Deine Berichte bleiben 14 Tage lokal einsehbar.

## Installieren

**Windows**
1. Im Zweig [`updates`](https://github.com/d0mm392/Argus/tree/updates) die Datei `Argus-Setup-x.y.z.exe` öffnen und „Download raw file“ klicken. Neue Nutzer bekommen die geprüften Versionen aus dem Zweig [`stable`](https://github.com/d0mm392/Argus/tree/stable).
2. Setup starten. Windows SmartScreen warnt, weil das Setup nicht signiert ist: „Weitere Informationen“ → „Trotzdem ausführen“.
3. Beim ersten Start fragt Argus nach Namen, KI und Anzeigen. Alles lässt sich später in den Einstellungen ändern.

**Linux:** AppImage, siehe [LINUX.md](LINUX.md).
**Mac (Test):** ZIP für Apple-Silicon und Intel, nicht signiert und ungetestet, siehe [MAC.md](MAC.md).

## Updates

Unter Windows prüft Argus beim Start den Update-Kanal (von Hand geht es über Einstellungen → System oder das Tray-Menü) und aktualisiert sich selbst (Einstellungen → System: „Stabil“ oder „Test“). Unter Linux und auf dem Mac gibt es noch keine automatische Aktualisierung.

## Datenschutz

Einstellungen, Schlüssel, Wallet-Adressen und Gedächtnis liegen nur auf deinem PC (`%APPDATA%\argus-desktop` unter Windows) und nicht in diesem Repo. Schlüssel werden mit Electron safeStorage verschlüsselt. Argus zeichnet nichts heimlich auf und sendet nichts ohne dein Klicken.

## Selbst bauen

Gebaut in JavaScript auf Electron 33 (HTML/CSS und Vanilla-JS, PowerShell für die Windows-Sensoren). Den Code gibt es im Zweig `source`:

```
npm install
npx electron .                                  # starten
npx electron-builder --win nsis --x64           # Installer
```
