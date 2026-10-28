# Argus 0.58.21 – Sicherheits-Hotfix im Testkanal

Diese Version erscheint im Testkanal `updates`. Der stabile Kanal bleibt unverändert.

## Änderungen

- Datei- und Programmzugriffe prüfen neben dem angegebenen Pfad das tatsächliche Ziel. Geschützte Argus-Profile, Zugangsdaten und Daten der abgeschalteten Selbstverbesserung werden auch über alternative Pfade abgewehrt. Nicht eindeutig zuordenbare Ziele und Dateien mit mehreren Hardlinks werden abgelehnt.
- Verknüpfungen werden vor dem Lesen geprüft. Programme aus `.lnk`-Dateien starten nur über ihr geprüftes EXE-Ziel, ohne Verknüpfungsargumente und mit erlaubtem Arbeitsordner. Das kann bisher verwendete Verknüpfungen mit Argumenten ausschließen.
- Paket-App-IDs werden nur nach Paketzuordnung und vollständiger Shortcut-Kollisionsprüfung freigegeben. Ist die Prüfung wegen Lesefehlern, verknüpfter Ordner oder der Tiefengrenze unvollständig, bleibt dieser Startweg gesperrt. Normale geprüfte EXE-/Shortcut-Starts bleiben getrennt nutzbar.
- Ausgeschlossene oder unauflösbare Suchtreffer werden vor dem Begrenzen der Kandidaten entfernt. Die Windows-Inhaltssuche erhält Suchbegriffe als Daten statt als ausführbaren PowerShell-Code.
- Die Selbstverbesserung bleibt abgeschaltet.

## Prüfstand und bekannte Einschränkungen

- Unter Node 20 und 24 bestehen jeweils 17 Hotfix-Tests und 23 Pfadtests; ein VM-Fall ist übersprungen. Die gezielten Electron-Prüfungen bestehen: 19 UI-Prüfungen sowie drei Startläufe mit je 6 Prüfungen. Normale Programmstarts, echte Windows-Verknüpfungen und das Öffnen einer künstlichen Textdatei wurden zusätzlich am gebauten Paket geprüft.
- **Offene Menü-Testlücke:** In der allgemeinen UI-Suite funktionieren Startseiten-Menü, Messwerte-Untermenü und die erste Checkbox-Gegenprobe. Nach dem Schließen und einem synthetischen Wechsel auf Mining findet der Test kein Menü und bricht später beim Zugriff auf ein fehlendes Fenster ab. 10 der 13 erreichten Ergebnisse bestehen; 54 weitere Prüfstellen wurden nicht erreicht. Die Menüimplementierung ist gegenüber 0.58.20 unverändert. Ein Laufzeitvergleich mit 0.58.20 scheiterte am Start der Test-VM. Ein Fokus-/Timingproblem des Tests ist plausibel, aber nicht bewiesen; eine Störung beim erneuten Öffnen des Menüs nach Seitenwechsel ist nicht ausgeschlossen. Im Testkanal bitte insbesondere Start → Rechtsklick/Messwerte → regulär schließen → Mining → Rechtsklick/Messwerte und erneutes Umschalten der Freundesliste prüfen.
- **Fehlender VM-Nachweis für symbolische Links (P5):** Das nicht erhöhte VM-Konto darf Datei-/Ordner-Symlinks nicht anlegen (EPERM); diese Gegenproben einschließlich relativem Ordnerlink bleiben dort übersprungen. Auf dem Windows-Host bestehen sie unter Node 20 und 24. Das ist ein echter Windows-Nachweis, aber kein Nachweis unter genau der VM-Konfiguration. Vorhandene, von anderen Prozessen angelegte Links bleiben deshalb ein wichtiger Testfall. Junctions, Hardlinks, echte 8.3-Kurznamen und `subst` wurden in der VM geprüft.
- Der allgemeine Windows-Steam-Test scheitert bereits in 0.58.20 am Testaufbau: Er setzt einen künstlichen Pfad, den der Windows-Code zugunsten der Registry-Abfrage ignoriert. Mit kontrollierter Registry-Antwort und künstlichen Logdateien bestehen beide Versionen: ein laufendes Spiel ergibt keinen Download, ein laufendes Update einen aktiven Download. Dies ist kein Integrationstest einer echten Steam-Installation.
- Echte Paket-App-Abfrage/-Aktivierung und Windows-Suchindex-COM sind nicht vollständig integriert geprüft. Mit diesem Installer wurde keine neue VM-Installations-/Update-Szenarienreihe durchgeführt.
- Prüfung und Zugriff sind nicht atomar; ein gleichzeitiger Pfadwechsel durch einen anderen Prozess bleibt eine bekannte Grenze. Geöffnete Programme und Standardprogramme laufen weiterhin mit den Rechten des Nutzers.

## Download und Integrität

Windows x64: `Argus-Setup-0.58.21.exe`, **90.300.305 Bytes**, nicht signiert.

SHA-256:

```text
6788a264a6a6309ff71536aa6ead9dd6b0c0978238479f313cb2b9417e50265a
```

Im Zweig `updates` stehen außerdem Blockmap, Dateimanifest, Quellarchiv, Build-Zuordnung und `SHA256SUMS.txt`. Alle 4.803 extrahierten Installerdateien wurden mit dem Manifest abgeglichen; die 76 ausdrücklich paketierten Quelldateien stimmen mit dem geprüften Windows-Export überein. Diese Angaben beruhen auf Selbstprüfung, nicht auf einem unabhängigen Review.

Installierte Testkanal-Nutzer können über den normalen Argus-Updater aktualisieren. Diese Veröffentlichung ändert weder den stabilen Kanal noch eine lokale Installation automatisch durch ein Entwicklungswerkzeug.
