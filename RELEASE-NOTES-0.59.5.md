# Argus 0.59.5 – Selbstdiagnose und Sicherheitsstart

**Neu**
- **Sicherheitsstart:** Stürzt Argus zweimal hintereinander ab, startet es beim nächsten Mal ohne Grafikbeschleunigung und öffnet YouTube und Twitch nicht von selbst. Ein Hinweis sagt das an. So kommt man auch nach einer Absturzschleife wieder in Argus und kann Updates laden. Läuft Argus 90 Sekunden stabil, startet es danach wieder normal.
- **Blackbox:** Argus schreibt laufend kurz mit, was es gerade tut, z. B. „YouTube lädt Video“, „Grafikprozess beendet“, Standby oder Einstellungsänderungen (nur die Namen, keine Inhalte). Nach einem Absturz stehen die letzten Schritte des abgestürzten Laufs in `blackbox.prev.log`.
- **Absturz-Abbilder:** Die eingebaute Absturzaufzeichnung von Electron ist an, aber nur lokal. Nichts wird hochgeladen. Argus behält die fünf neuesten.
- **Diagnose speichern:** Unter Einstellungen › System › Fehlerberichte packt ein Knopf Blackbox, Fehlerprotokoll, Berichte, Absturz-Abbilder und Systemangaben (Windows, Grafikkarte, Treiber, Einstellungen zu Grafik und YouTube) in eine Zip-Datei auf dem Desktop. Benutzername, Pfade, Schlüssel und Wallet-Adressen werden aus den Textdateien entfernt. Die Datei kann man an jemanden schicken, der helfen soll.

**Hinweis**
- Alles bleibt auf diesem PC, gesendet wird nur, was du selbst weiterschickst.
