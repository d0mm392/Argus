# Argus 0.58.27 – Startabsicherung, Apple-Modus vorübergehend entfernt

Dringende Korrektur für Installationen, die nach einem Update nicht mehr öffneten.

- Startabsicherung:
  - Bisher konnte ein Fehler im Startablauf spurlos verschwinden. Dann erschien kein Fenster, und es gab keinen Eintrag in `argus-error.log` oder im Fehlerverlauf. Ein unsichtbarer Argus-Prozess hielt außerdem die Einzelinstanz-Sperre, sodass jeder weitere Start sich sofort beendete.
  - Jetzt ist jeder Startschritt vor und nach dem Fenster einzeln abgesichert und wird bei einem Fehler protokolliert. Das Fenster erscheint trotzdem.
  - Scheitert der Start dennoch, schreibt Argus den Fehler ins Protokoll, zeigt eine Meldung und beendet sich. Der nächste Start kann es dann erneut versuchen.
  - Abgelehnte Promises werden ebenfalls protokolliert.
- Der optionale Apple-Modus aus 0.58.26 ist vorübergehend entfernt und für eine spätere Version gesichert. Klassisch ist wieder die einzige Oberfläche, wie in 0.58.25.
  - War der Apple-Modus eingestellt, startet Argus in Klassisch.
  - Eine liegengebliebene Startsicherung (`ui-start.json`) wird entfernt.
- Einstellungen, Notizen, Anordnungen und Gedächtnis bleiben unverändert. Das Profil wird nicht gelöscht.

Aktualisieren ohne laufendes Argus: Installer direkt herunterladen und ausführen. Der Link steht in der README des Testkanals. Er installiert über die bestehende Version, die Daten bleiben erhalten.

Geprüft:
- Testsuite wie 0.58.25.
- Tests für Startabsicherung und Entfernung.
- Installiertes Paket in einer Offline-VM: Neuinstallation, Update von 0.58.20 (befülltes Profil), 0.58.25 und 0.58.26 (Apple-Modus eingestellt), jeweils Start der installierten Anwendung und Vergleich mit dem Manifest.

Stable bleibt unverändert.
