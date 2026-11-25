# Argus 0.59.8 – Diagnose für spätere Analysen

**Neu in „Diagnose speichern“**
- `funktionen.json`: Auf einen Blick, was eingerichtet ist und was Fehler meldet. Enthalten sind KI (Anbieter, Claude Code gefunden, Strata, Spracherkennung), Temperaturmessung (Messdatei, CPU-/GPU-Werte vorhanden, fehlende Dateien), Discord, Steam, Mining (Foreman, Portal, Pool-Daten), Smart Home, Wetter, YouTube (Filter, Dekodierung, gesperrte Videos), Update-Kanal und letzte Update-Meldung, Grafikmodus, Bildschirme und Fehlerberichte. Es stehen nur Ja/Nein-Angaben und Zustände drin, keine Namen, Schlüssel oder Adressen.
- `einstellungen.json`: alle Einstellungen. Schlüssel, Adressen, Namen, Notizen, lange Texte und gesehene Videos erscheinen nur als „gesetzt“ oder „leer“.
- `prozesse.json`: Prozesse von Argus mit Speicher und CPU.
- `versionen.json`: wann welche Argus-Version zum ersten Mal lief. So lässt sich „seit dem Update …“ belegen.

**Neu in der Blackbox**
- Hängt der Hauptprozess länger als 3 Sekunden, wird das mit der Dauer vermerkt. Hänger sind sonst unsichtbar.
- Alle 10 Minuten werden Prozesse und Speicher kurz notiert. So fällt ein schleichend wachsender Speicher auf.
- Bildschirme (Auflösung, Skalierung) beim Start.
- Update gefunden und Update-Fehler.
- „Oberfläche reagiert nicht / wieder“.

**Neu beim Start**
- Hat Electron seit dem letzten Start ein neues Absturz-Abbild geschrieben, erscheint das im Fehlerbericht mit dem Hinweis, die Diagnose mitzuschicken.
