# Argus: Architektur (Stand 0.41.0)

Zweck: Wer am Code arbeitet (ich oder jemand anderes), findet hier schnell, wo was liegt und welche Regeln gelten. Anforderungen: ANFORDERUNGEN.md. Tests: `npm test`.

## Prozesse
- **Hauptprozess** (`main.js`): Fenster, Einstellungen (`DEFAULTS`, `SETTABLE`, `get-config`), Rechtsklick-Menü (zwei Fenster: `menu.html`), Tray, Updates, KI-Aufrufe, IPC.
- **Oberfläche** (`app/index.html` + `app/style.css` + `app/js/*.js`): Kugel, Panel, Einstellungen. Läuft über den lokalen Server aus `main.js` (`startServer`).
- **Brücke**: `preload.js` (window.jarvis), `preload-menu.js`. Die Oberfläche hat keinen direkten Node-Zugriff.
- **Module im Hauptprozess**: `system.js` (Messwerte, dauerhafter PowerShell-Monitor `sysmon/`), `games.js` (Spielerkennung), `crash.js` (Fehlerberichte, 14 Tage), `mining.js`, `foreman.js`, `weather.js`, `news.js`, `social.js`, `dcbot.js`, `strata.js`, `report.js`, `memory.js`, `selfimprove.js`, `boot.js` (Datenordner; Rollback seit 0.58.20 abgeschaltet).
- **Datei-Zugriffe der KI** (`files.js`, `actions.js`, `argus-mcp.js`): Lesen, Auflisten und Suchen für KI-Werkzeuge und Sprachbefehle laufen über die gemeinsame Schutzprüfung `files.checkPath` (seit 0.58.21). Sie prüft das tatsächliche Ziel (`fs.realpathSync.native`) gegen die Argus-Profilordner (auch `ARGUS_USERDATA`) und die Daten der Selbstverbesserung. Automatische Durchläufe prüfen jeden Ordner mit `files.enterDir`/`files.walkRoot`. Öffnen nur über `actions.openGuarded` (Positivliste von Dateitypen), Programmstart nur über `launchApp`/`launchCheck` (geprüfte `.exe`, `.lnk` nur ohne Argumente auf eine geprüfte `.exe`, App-IDs nur von installierten Paketen und nicht von Verknüpfungen beansprucht, eingebaute Programme mit absolutem Pfad). Die Spieleerkennung liest Bibliotheken und Manifeste nur nach derselben Prüfung. Interne Zugriffe (Einstellungen, Gedächtnis, Index) gehen direkt über `fs` und sind davon nicht betroffen. Regeln und Grenzen: ANFORDERUNGEN.md, R-FILE-1 bis R-FILE-5.

## Oberfläche: Dateien (Ladereihenfolge)
Alle `app/js/*.js` sind normale Skripte mit **gemeinsamem Namensraum**: Variablen und Funktionen einer Datei sind in allen anderen sichtbar. Reihenfolge = Reihenfolge in `index.html`.

| Datei | Inhalt |
|---|---|
| 01-grundlagen | `$`, Canvas, Fehler-Hook, gemeinsamer Hintergrund-Zustand `bg` |
| 02-kugel-formen | Hirnregionen, Neuronen, Formen |
| 03-freundesliste | Steam-/Discord-Freunde, Größe/Ziehen |
| 04-auslastung-zustand | Messzeiger in der Kugel, Zustände, Protokoll, Darstellung |
| 05-maus-anordnung | Beschriftungen, Maus, selbst angeordnete Teile |
| 06-bedienung | Bedienung an der Kugel, Rechtsklick-Aufbau |
| 07-ki-fenster-farben-anzeigen | KI-Anzeige, Fensterknöpfe, Farben, Anzeigen an/aus (`WIDGET_ROWS`) |
| 08-einstellungen-einrichtung | Einstellungen, Report, Einrichtung, Fehlerbericht |
| 09-wetter-mining-farm-notizen | Wetter, Mining, Farm, Notizblock, Schnellstart, Fenster-Spiegel |
| 10-anordnen-modus | Panel-Teile verschieben und skalieren |
| 11-hintergrund-youtube-rubriken | Hintergrund, YouTube, Fensterfarbe, Einstellungs-Rubriken |
| 12-ki-frage-sprache-systemwache | Frage-Ablauf, Sprache, Systemwache |
| 13-start | Start (`started = true`, Animationsschleife) |

**Wichtige Regel:** Eine Datei darf beim Laden nichts benutzen, was erst in einer späteren Datei deklariert wird. Auch Antworten auf Aufrufe (`.then(...)`) laufen zwischen zwei Dateien schon los. Gemeinsam gebrauchtes, das früh gebraucht wird, steht in 01 (Beispiel: `bg`).

## Seiten (Start / Mining / Gaming)
Pro Seite gespeichert (`snapPage` / `switchPage`): Panel-Layout, ausgeblendete Blöcke, Pins, Größen, Kugel an/aus und Versatz, Statusanzeige, KI- und Strata-Knopf, Freundeslisten-Größe. Was ein Menü zeigt, bestimmt `PAGE_DEF`, `MINE_BLK`, `pageHas()`, `pageBtn()`.

## Neue Einstellung anlegen (immer alle drei Stellen)
1. `DEFAULTS` in `main.js`. 2. `get-config` in `main.js`. 3. `SETTABLE` mit Typ. Wenn sie pro Seite gilt: zusätzlich `snapPage`/`switchPage`.

## Rechtsklick-Menü
`showStyledMenu` baut das Hauptmenü, Untermenüs sind ein zweites Fenster (`openSubMenu`). Häkchen-Einträge haben `keep` (Menü bleibt offen). **Einträge, die schalten, senden nie einen berechneten Zielzustand, sondern „umschalten“** (`flip`), weil das offene Menü sonst mit altem Stand arbeitet (Fehler 0.40.0).

## Tests
- `tests/unit.test.js`: Node, schnell (Spielerkennung mit echten Prozessdaten, Berichte).
- `tests/ui.test.js`: Electron unter xvfb mit leerem Datenordner und fester Testkonfiguration (`tests/harness.js`).
- Jede Prüfung trägt die Nummer aus ANFORDERUNGEN.md. Neue Regel → neue Zeile dort → neuer Test.
- Vor jedem Bau: `npm test` muss grün sein.

## Bau und Auslieferung
Siehe Gedächtnisordner `jarvis-release`: Version erhöhen, ANLEITUNG-Abschnitt, Windows-Bau, Zweig `updates` (nicht `stable`), README auf `main` prüfen, Zweig `source` nachziehen.

## Bekannte Grenzen
- Gemeinsamer Namensraum statt echter Module: Dateien sind getrennt, aber nicht voneinander abgeschottet. Nächster Schritt wäre zentraler Zustand pro Seite (ein Objekt statt vieler Variablen), danach erst ein Framework.
- Tests laufen unter Linux. Windows-Eigenheiten (Taskleiste, Schriften, Sensoren, Spiele) prüft der Nutzer von Hand.
