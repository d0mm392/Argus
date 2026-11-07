# Argus 0.59.3 – Temperaturmessung wieder vollständig

**Behoben**
- Seit 0.58.2 fehlten im Setup der Messtreiber (`PawnIO_setup.exe`) und die Messbibliothek (`LibreHardwareMonitorLib.dll` samt Abhängigkeiten). Die Einrichtung brach mit „Das System kann die angegebene Datei nicht finden“ ab, die Systemwache zeigte „Keine CPU-/GPU-Temperatur“. Die Dateien sind wieder dabei, unverändert aus den offiziellen Quellen (NuGet bzw. signiertes PawnIO-Setup von namazso).
- Fehlen Dateien trotzdem einmal, fragt Argus nicht mehr nach Admin-Rechten, sondern meldet klar, welche Datei fehlt.

**Sicherheit**
- Die Einrichtung prüft vorab die Prüfsummen aller Dateien (`SHA256SUMS.txt`) und die Signatur von namazso am Treiber-Setup. Veränderte Dateien werden nicht verwendet.
- Der Treiber wird beim ersten Start nicht mehr von selbst installiert. Er kommt erst nach einem Klick auf „Einrichten“ (Einstellungen → Temperaturmessung oder Hinweis unter den Messbalken). Wer die Messung schon eingerichtet hatte, merkt davon nichts.
- Der Windows-Bau bricht ab, wenn eine Sensor-Datei fehlt oder nicht zur Prüfliste passt. So kann der Fehler nicht wieder unbemerkt ins Setup rutschen.

**Hinweis**
- Veröffentlichung nur im Testkanal `updates`; Stable bleibt unverändert.
