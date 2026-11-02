# Argus 0.58.30 – Windows-Systemende und Wetterausfälle

- Bestätigtes Windows-Systemende entfernt den Laufmarker auch dann, wenn `will-quit` ausbleibt. Kein Blockieren des Herunterfahrens. Erzwungene Prozessabbrüche bleiben erkennbar, auch ohne Fehlereintrag.
- Laufmarker enthalten ein Lebenszeichen. Fehlerkontext wird auf dessen zeitliche Nähe begrenzt und ausdrücklich nicht als nachgewiesene Ursache bezeichnet. Alte Wetterfehler werden nicht einem späteren Abbruch zugeschrieben.
- Eine zweite Instanz beendet sich vor der Marker-Verwaltung.
- Letzte erfolgreiche Wetterdaten werden separat vom Einstellungsprofil gespeichert. Bei Ausfall erscheinen sie als veraltet mit Zeitstempel, auch nach einem Neustart. Ohne Daten erscheint „Wetterdienst vorübergehend nicht erreichbar“.
- Wetterabfragen laufen gemeinsam und ohne Überlappung. Nach Fehlern folgen zwei Wiederholungen nach 30 Sekunden und 2 Minuten, danach der normale 15-Minuten-Takt. Gleichartige Fehler werden während eines Ausfalls nur einmal protokolliert.
- Koordinaten und Wetterantworten werden geprüft; fehlende aktuelle Temperaturwerte werden nicht als 0 °C übernommen. Orte und Einstellungen bleiben erhalten.
- Der veröffentlichte Startfix 0.58.29 bleibt enthalten. Veröffentlichung ausschließlich im Testkanal `updates`; Stable bleibt unverändert.

Die beim Kollegen fehlenden Daten sind ohne dessen zugehörige Diagnose nicht eindeutig den beobachteten HTTP-503-Antworten zuzuordnen. Die Behandlung vorübergehender Ausfälle wurde unabhängig davon geprüft.
