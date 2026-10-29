# Argus: Apple-Modus – Designbericht

Stand: 29.10.2026 · Grundlage: Argus 0.58.25 (`source` c9c33e9)

## 1. Ziel und Grenzen
- **Zwei Oberflächen.** Unter *Einstellungen → Aussehen → Oberfläche* gibt es „Klassisch“ (Standard, unverändert) und „Apple-Modus“. Gewechselt wird mit einem kontrollierten Neustart. Bestehende und neue Installationen starten in Klassisch.
- **Nur die Darstellung des aufgeklappten Panels ist neu.** Der Apple-Modus gestaltet das aufgeklappte Panel neu: Sidebar, Toolbar, Inhaltsbereich und Einstellungsfenster. Fenstermechanik, Daten und Funktionen (Kugel, Ecke, Aufklappen, Seiten, Mining, Discord, Notizen, KI, YouTube, Twitch, Rechtsklickmenüs) bleiben dieselben. Es gibt **keine zweite Implementierung** von Kernfunktionen: Die Shell ruft die vorhandenen Funktionen auf, das Stylesheet ordnet die vorhandenen Elemente neu an.
- **Ehrlich unter Windows.** Es wird keine macOS-Technik vorgetäuscht: keine Ampelknöpfe, keine Menüleiste am Bildschirmrand, keine Apple-Schriften oder -Symbole. Die Windows-Fensterknöpfe bleiben rechts und tun, was sie unter Windows tun.

## 2. Quellen (Apple Human Interface Guidelines, abgerufen am 29.10.2026)
Abgerufen über die offiziellen Seitendaten unter `developer.apple.com/tutorials/data/design/human-interface-guidelines/<seite>.json`. Seiten:

| Seite | URL | Letzte Änderung laut Änderungsprotokoll |
|---|---|---|
| Designing for macOS | https://developer.apple.com/design/human-interface-guidelines/designing-for-macos | 28.10.2026 |
| Sidebars | https://developer.apple.com/design/human-interface-guidelines/sidebars | 08.06.2026 |
| Toolbars | https://developer.apple.com/design/human-interface-guidelines/toolbars | 16.12.2025 |
| Materials | https://developer.apple.com/design/human-interface-guidelines/materials | 09.09.2025 |
| Typography | https://developer.apple.com/design/human-interface-guidelines/typography | 16.12.2025 |
| Motion | https://developer.apple.com/design/human-interface-guidelines/motion | 09.09.2025 |
| Accessibility | https://developer.apple.com/design/human-interface-guidelines/accessibility | 09.06.2025 |
| Settings | https://developer.apple.com/design/human-interface-guidelines/settings | 10.06.2024 |
| Menus, Context menus | https://developer.apple.com/design/human-interface-guidelines/menus, …/context-menus | 08.06.2026 / 05.12.2023 |
| Windows, Layout, Color, Dark Mode | …/windows (09.06.2025), …/layout (09.09.2026), …/color (16.12.2025), …/dark-mode (06.08.2024) | |
| Buttons, Toggles, Segmented controls, Popovers, Sheets, Alerts | …/buttons (16.12.2025), …/toggles, …/segmented-controls, …/popovers, …/sheets, …/alerts | |
| SF Symbols, App icons | …/sf-symbols (28.07.2025), …/app-icons (28.10.2026) | |

Die Seite „Images“ und die Font-Seite `developer.apple.com/fonts` waren wegen Verbindungsabbrüchen nicht abrufbar.

## 3. Übernommene Regeln und ihre Umsetzung in Argus
| HIG-Regel (sinngemäß) | Umsetzung |
|---|---|
| Sidebar am vorderen Rand für die Navigation zwischen Hauptbereichen; vertraute Symbole; Gruppen; ausblendbar; nichts Wichtiges unten (Sidebars) | Sidebar links mit den vorhandenen Seiten (Start, Mining, Gaming, Trading, eigene Seiten) und den Bereichen Assistent und Notizen; ein Knopf blendet sie aus. Einstellungen stehen oben im App-Menü, nicht am unteren Rand. Symbole sind eigene, schlichte Linienzeichnungen (keine SF Symbols). |
| Toolbar oben im Fenster, Titel integriert, wenige Einträge, ohne Rahmen um die Knöpfe; jede Toolbar-Aktion auch als Befehl im Menü (Toolbars) | Einheitliche Titel- und Toolbar-Leiste: vorne das App-Menü (Argus), dann der Seitentitel, hinten YouTube, Twitch, Strata und die Windows-Fensterknöpfe. Alle Toolbar-Aktionen sind zusätzlich im App-Menü und im Rechtsklickmenü erreichbar. |
| Einstellungen über das App-Menü und Strg+Komma; eigenes Einstellungsfenster mit einer festen Leiste für die Bereiche, aktiver Bereich hervorgehoben (Settings) | Einstellungen öffnen im App-Menü und mit **Strg+,**. Das Einstellungsfenster hat oben eine feste Bereichsleiste (Allgemein, Aussehen, KI, …) aus `settings-categories.js`; der aktive Bereich ist markiert. |
| Liquid Glass bzw. Materialien nur für die Steuerebene (Sidebar, Toolbar), nicht für Inhalte; sparsam; Lesbarkeit zuerst; dickere Materialien für Text (Materials) | Sidebar und Toolbar bekommen ein dezentes, durchscheinendes Material. Die Inhaltskarten sind deckend (Standardmaterial). „Transparenz reduzieren“ und die Systemvorgabe `prefers-reduced-transparency` machen auch die Steuerebene deckend. Kein Glas in Karten. |
| Typografie: SF Pro ist die macOS-Systemschrift; Textstufen Body 13 pt, Headline 13 pt fett, Title 2 17 pt, Title 1 22 pt, Large Title 26 pt (Typography) | Schrift: **Segoe UI Variable** bzw. Segoe UI, die Windows-Systemschrift, als ehrliche Entsprechung. SF Pro wird weder mitgeliefert noch eingebunden (Apple lizenziert die SF-Schriften für Apple-Plattformen). Übernommen wird die Größenhierarchie: 13/16 Fließtext, 11 Beschriftung, 17 Abschnittstitel, 22 Seitentitel. |
| Kontrast mindestens 4,5:1 bis 17 pt, 3:1 ab 18 pt oder fett; Information nicht nur über Farbe; Mindestgröße der Bedienelemente in macOS 28×28 pt, mindestens 20×20 pt; vollständige Bedienung per Tastatur (Accessibility) | Text- und Hintergrundfarben sind so gewählt, dass 4,5:1 erreicht wird (in den Tests geprüft). Toolbar- und Sidebar-Ziele mindestens 28×28 px. Ausgewählte Sidebar-Zeilen haben eine Fläche **und** fette Schrift. Sichtbarer Fokusrahmen; Sidebar mit Pfeiltasten bedienbar. |
| Bewegung zweckmäßig, kurz und abschaltbar; Information nie nur über Bewegung (Motion) | Übergänge höchstens 160 ms, nur Deckkraft und kleine Verschiebungen. „Animationen reduzieren“ und `prefers-reduced-motion` schalten sie ab. Die Kugel bleibt; ihre Bewegung folgt den vorhandenen Einstellungen. |
| Kontextmenüs zeigen häufige, zum Objekt passende Befehle; nicht verfügbare ausblenden (Context menus, Menus) | Die vorhandenen Rechtsklickmenüs (eigene Menüfenster `menu.html`) bekommen im Apple-Modus eine macOS-artige Gestaltung: helle bzw. dunkle Fläche, 13-px-Schrift, Trennlinien, Tastenkürzel rechts. Inhalt und Reihenfolge der Einträge bleiben. |
| Hell- und Dunkelmodus (Dark Mode, Color) | Der Apple-Modus folgt dem Windows-Farbschema (`prefers-color-scheme`). Akzentfarbe ist Systemblau, als eigene Farbwerte nachgebaut, nicht über Apple-Assets. |

## 4. Aufbau (Apple-Modus, aufgeklapptes Panel)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ▯ [Argus ▾]  Start · Status            YouTube  Twitch    –  □  ✕   │  Toolbar (Steuerebene)
├────────────┬─────────────────────────────────────────────────────────┤
│ Seiten     │  ┌──────────────────────┬──────────────────────────────┐ │
│ ● Start    │  │ Kugel (dunkle Kachel)│ Chatverlauf und Eingabe      │ │  Assistent-Karte
│   Mining   │  └──────────────────────┴──────────────────────────────┘ │
│   Gaming   │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │  Inhaltskarten (deckend)
│   Trading  │  │ Systemwache  │ │ Mining       │ │ Uhr/Wetter   │      │  im Raster, Reihenfolge
│ + Neue     │  └──────────────┘ └──────────────┘ └──────────────┘      │  wie im DOM, sichtbar
│   Seite    │  ┌──────────────┐                                        │  nach den vorhandenen
│            │  │ Notizen      │   Protokoll (volle Breite)             │  Seiten-Einstellungen
└────────────┴─────────────────────────────────────────────────────────┘
```
- **Toolbar:** Sidebar ein/aus, App-Menü „Argus“ (Einstellungen … Strg+,, YouTube, Twitch, Strata, Zur Kugel verkleinern, Ausblenden, Maximieren, Beenden). Jeder Eintrag löst den vorhandenen Knopf aus. Es gibt keine neue Funktion.
- **Sidebar:** Sie spiegelt die vorhandene Seitenleiste (`#pageTabs`). Klick und Rechtsklick werden an die Originalknöpfe weitergegeben. Seitenmenü (Ausblenden, Umbenennen, Löschen) und „Neue Seite“ sind damit identisch.
- **Kugel:** Die eingeklappte Kugel in der Ecke bleibt unverändert. Im Panel steht die Kugel in der dunklen Kachel der Assistent-Karte. Die Freundeslisten (Steam/Discord) bleiben dort an der Kugel. Ziehen und Größenänderung sind im Apple-Modus gesperrt, damit die gespeicherte klassische Lage erhalten bleibt.
- **Einstellungen:** Fenster über dem Inhaltsbereich mit fester Bereichsleiste (acht Bereiche, Suche). Inhalt und Logik sind dieselben wie in Klassisch.
- **Dialoge, Pop-ups, Menüs:** Fehlerbericht, Anleitung, Miner-Report, Eingabedialoge, Seiten- und Listenmenüs erscheinen als deckende Blätter mit Systemschrift. Die Rechtsklickmenüs (eigene Fenster, `app/menu.html`) erhalten den Modus und zeigen dieselben Einträge in macOS-artiger Form: Auswahl in Akzentfarbe, Trennlinien, Häkchen.
- **Anordnen:** Die freie Anordnung (Anordnen-Modus) gehört zur Gestaltung von Klassisch. Im Apple-Modus ordnet das Raster die Karten. Der Knopf und der Menüeintrag „Anordnen“ entfallen dort, Zieh-Handler sind gesperrt. Welche Karten eine Seite zeigt, bleibt über die vorhandenen Seiten- und Anzeige-Einstellungen steuerbar. Gespeicherte Anordnungen bleiben unverändert und gelten nach dem Wechsel zurück zu Klassisch wieder.

## 5. Moduswechsel und Wiederherstellung
1. **Auswählen und übernehmen.** Unter *Aussehen → Oberfläche* wählen und auf **„Übernehmen und neu starten“** klicken.
   - Argus speichert zuerst alle Einstellungen.
   - Läuft gerade eine relevante Aktion, wird nicht neu gestartet. Stattdessen erscheint ein Hinweis. Relevant sind: Einrichtung der lokalen KI, Update-Download, jeder andere Download (Sprachpakete) und der Start von Strata. Notizen werden vorher gespeichert (`notes-flush`).
2. **Startsicherung.** Vor dem Laden im Apple-Modus legt Argus `ui-start.json` an. Meldet die Oberfläche Bereitschaft, wird die Datei gelöscht. Das geschieht erst, wenn der Aufbau vollständig gelaufen ist, die Einstellungen geladen sind und die Seite danach 3 s stabil läuft. Ein Lesefehler der Datei zählt wie eine liegengebliebene Datei.
   - Bleibt die Datei bis zum nächsten Start liegen, ist der letzte Apple-Start gescheitert. Argus startet dann einmalig in Klassisch, setzt die Einstellung auf Klassisch und zeigt einen Hinweis.
   - Es gibt keine Neustartschleife: Für Klassisch wird keine Startsicherung angelegt, und es wird kein automatischer Neustart ausgelöst.
3. **Rückweg.** Zurück zu Klassisch geht jederzeit über die Einstellungen und über das Tray-Menü („Oberfläche: Klassisch wiederherstellen“). Das Tray-Menü funktioniert auch dann, wenn die Oberfläche nicht lädt. Beide Wege nutzen dieselbe Prüfung laufender Aktionen. Ist der Wechsel gerade nicht möglich, nennt der Tray-Weg den Grund in einem Dialog.
4. **Datenerhalt.** Der Wechsel ändert nur `uiMode`. Alle übrigen Einstellungen, Anordnungen, Notizen und Gedächtnisdaten bleiben unberührt.

## 6. Funktionsinventar und Erreichbarkeit
Beide Oberflächen laden dieselben Skripte (`app/js/*.js`), dieselbe `main.js` und dieselben Einstellungen. Der Apple-Modus fügt nur `app/apple.css` (wirkt nur unter `html[data-ui="apple"]`) und `app/js/20-apple-modus.js` hinzu. Dieses Skript ordnet vorhandene Elemente um und leitet Bedienung an die Originalknöpfe weiter.

| Bereich | Klassisch | Apple-Modus | Nachweis |
|---|---|---|---|
| Seiten Start, Mining, Gaming, Trading, eigene Seiten | Reiter oben | Sidebar (gespiegelt, Klick/Rechtsklick weitergeleitet) | apple-mode.test.js |
| Neue Seite | „+“ im Reiter | Sidebar „Neue Seite“ (derselbe Dialog) | apple-mode.test.js, Screenshot neue-seite |
| Einstellungen (8 Bereiche, Suche) | Knopf ☰ | App-Menü „Einstellungen …“, Strg+, | apple-mode.test.js (alle Bereiche, alle Elemente) |
| YouTube, Twitch, Strata | Knöpfe oben | Toolbar-Knöpfe und App-Menü | apple-mode.test.js, youtube-mode.test.js |
| Seitennotizen | Karte | Karte im Raster | notes-pages/notes-layout.test.js (beide Modi) |
| Mining (Karten, Report, Einstellungen) | Seite Mining | Seite Mining | apple-mode.test.js, Screenshots mining |
| Discord/Steam-Freunde, Discord-Konto | an der Kugel, Einstellungen | an der Kugel (feste Lage), Einstellungen | discord-*.test.js, friends-settings.test.js (beide Modi) |
| Rechtsklickmenüs (Fenster, Widgets, Text) | eigenes Menüfenster | dasselbe Menüfenster, Apple-Gestaltung | menus.test.js (beide Modi) |
| Anordnen (freie Lage) | Knopf und Menü | entfällt bewusst (Raster) | Abschnitt 4 |
| Fensterknöpfe | rechts oben | rechts oben (Windows-Lage) | Screenshots |

Die Erreichbarkeitsprüfung startet die isolierte Testumgebung je Oberfläche. Sie sammelt alle sichtbaren bedienbaren Elemente mit ID je Seite und je Einstellungsbereich und verlangt, dass jedes in Klassisch sichtbare Element auch im Apple-Modus sichtbar ist. Ausgenommen sind nur die drei ersetzten Knöpfe (settingsBtn, pgPlus, arrangeBtn). Grenze: Elemente ohne ID werden nicht einzeln gezählt. Sie liegen aber in denselben, nachweislich sichtbaren Bereichen.

## 7. Prüfungen
- `tests/ui-mode.test.js`: Startsicherung, Rückfall nach gescheitertem Start, keine Schleife, Wechselprüfung bei laufenden Aktionen.
- `tests/apple-mode.test.js`: Erreichbarkeit (siehe oben), WCAG-Kontraste der Apple-Farben hell/dunkel (Text ≥ 4,5:1, weiße Schrift auf Akzentfläche ≥ 4,5:1) und Startsicherung im Renderer. Die Bereitschaft wird nur nach vollständigem Aufbau gemeldet; bei absichtlich gescheitertem Aufbau kommt keine Meldung.
- `tests/ui-switch-live.test.js`: echter Hauptprozess (`main.js`) in einem isolierten Profil (Benutzer-, AppData-, Gedächtnis- und Indexpfade umgeleitet, Node-Netz nur 127.0.0.1, keine globalen Kurzbefehle, kein Autostart, Fremdanbindungen aus; keine Sandbox für Kindprozesse). Geprüft wird Klassisch → Apple → Klassisch über die Einstellungen mit drei echten Neustarts (`app.relaunch` + `app.quit`). Die Startsicherung wird nach Bereitschaft gelöscht, Notiz und Anordnung bleiben erhalten. Stürzt Argus vor der Bereitschaft ab, startet es beim nächsten Mal einmal in Klassisch und setzt die Einstellung zurück, ohne weiteren Start. Ein Wächter prüft, dass echte Claude-Desktop-Konfigurationen unverändert bleiben.
- Alle vorhandenen Electron-Oberflächentests laufen in beiden Modi grün (`ARGUS_TEST_UI=apple`).
- Klassisch unverändert: berechnete Stile aller Elemente mit ID (Start und Einstellungen) gegen 0.58.25 verglichen, 24 486 Werte, 0 Abweichungen (`tests/classic-styles-dump.js`).
- Screenshots beider Modi hell/dunkel: `tests/apple-screens.js` (`ARGUS_TEST_VIEWS=mehr` für weitere Ansichten).
