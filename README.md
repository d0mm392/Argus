# Argus Startdiagnose 0.58.27-diagnose.2

Eigenständiges Windows-x64-Diagnosepaket. **Kein Argus-Update und kein Ersatz für die normale Installation.**

## Bedienung

1. `Argus-Diagnose-Setup-0.58.27-diagnose.2.exe` aus dem gekennzeichneten Diagnose-Prerelease herunterladen und installieren. Installation nur für den aktuellen Benutzer, keine Administratorrechte nötig.
2. Die eigene Verknüpfung **Argus Startdiagnose** öffnet die kleine Diagnoseoberfläche.
3. **Argus-Diagnose starten** anklicken und bis zu einer Minute warten. Im zusätzlich geöffneten Argus-Fenster nichts einrichten oder eingeben.
4. Ergebnis lesen und **Bericht speichern** anklicken. Das Ergebnis-ZIP wird standardmäßig auf dem Desktop angeboten. Es wird nur gespeichert, wenn der Benutzer den Speicherdialog bestätigt.
5. Das ZIP selbst an den gewünschten Empfänger schicken. Es gibt keinen automatischen Upload.

Auch wenn Argus sofort abstürzt, bleibt die Diagnoseoberfläche geöffnet. Genau ein Start pro Betätigung; weitere Betätigungen sind während eines laufenden Versuchs gesperrt. Nach Ende der Beobachtungszeit beendet die Oberfläche ausschließlich ihren eigenen Testprozess samt Kindprozessen.

## Grenzen und Datenschutz

- Immer ein **frisches, getrenntes Diagnoseprofil**. Ein Erfolg bestätigt **nicht** das bestehende Originalprofil und reproduziert dessen gespeicherte Fenster, Integrationen und Einstellungen nicht.
- Medienintegration ist ausgeschaltet; keine lokale KI-Einrichtung, keine Claude-Desktop-Verknüpfung, keine Autostart- oder Updater-Registrierung. Sprachmodell-/Netzwerkfehler können im isolierten Testprofil auftreten und sind im Bericht erkennbar.
- Der Bericht enthält ausschließlich begrenzte Startmarkierungen, gefiltertes stdout/stderr und Electron-Logging, Exitcodes, Ergebnis und getrennte Start-/Sammlungsfehler. Keine Nachrichten, Zugangsdaten, Cookies, vollständigen Profile oder Speicherabbilder. Renderer-Konsoleninhalte und URLs werden entfernt. Es gibt keine Funktion zur Dump-Erstellung; dafür wäre eine separate ausdrückliche Zustimmung nötig.
- Keine automatischen Wiederholungen oder Uploads. Fehler beim Export lassen den bereits gesammelten Bericht bestehen.
- Eigener Programmordner, App-ID `de.argus.startdiagnose.controller`, Verknüpfung und Deinstallationseintrag mit GUID `40b90b90-1a84-48be-9616-3880377de926`.
- Deinstallation über Windows → Installierte Apps → **Argus Startdiagnose (separates Diagnosepaket)**. Die normale Argus-Installation bleibt erhalten. Gespeicherte Ergebnis-ZIPs und die eigenen lokalen Diagnose-Arbeitsdaten bleiben erhalten; sie liegen getrennt unter `%APPDATA%\argus-startdiagnose-controller`.
- Installer unsigniert. Windows kann deshalb einen Herausgeber-/SmartScreen-Hinweis anzeigen. Die SHA-256-Prüfsumme ist der Veröffentlichung beigefügt.
- Tests in einer Windows-VM ersetzen keine Prüfung des konkreten betroffenen Rechners, seiner GPU-/Audio-Treiber oder seines Originalprofils.

## Architektur und Quellstand

`controller.cjs` / `preload.cjs` / `ui.js`: unabhängige Electron-Oberfläche mit isoliertem Renderer und auf die eigene Hauptseite begrenztem IPC. `runner.cjs`: ein Prozess pro Versuch, Parallelitätssperre, begrenzte/gefiltete Ausgaben, explizite Exportliste und atomarer ZIP-Export. Der Kontrollprozess lädt den Argus-Hauptprozess niemals als Modul.

`payload-source/` enthält den nachvollziehbaren Quellstand der bereits instrumentierten Argus-0.58.27-Diagnoseversion. Claudes Startabsicherung bleibt erhalten. Ergänzungen des Installers: getrennte App-ID und Markierung für `ready-to-show`. Das bisherige produktive Argus-Projekt wird nicht bearbeitet.

Dieses Paket hat keine Updatequelle und erzeugt kein `latest.yml`. Es wird ausschließlich als ausdrücklich gekennzeichnetes GitHub-Prerelease mit eigenem Diagnosebranch/-tag verteilt. `main`, `source`, `updates` und `stable` bleiben unverändert.

Siehe `BUILDING.md` und `SOURCE-PROVENANCE.json`. GPL-3.0-only für den Argus-/Diagnosequellcode; mitgelieferte Drittkomponenten behalten ihre jeweiligen Lizenzen.
