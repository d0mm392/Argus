# Argus 0.59.1 – Bildschirm übertragen: Fehler behoben

**Behoben**
- Im Übertragungsfenster waren alle Bereiche gleichzeitig zu sehen, auch „Annehmen und übertragen“, obwohl noch keine Anfrage da war. Ein Klick darauf tat nichts, und „Verbinden“ war gesperrt, solange auf dieser Seite schon ein Code wartete. Jetzt ist immer nur der passende Bereich sichtbar.
- „Vermittlungsserver nicht erreichbar“: Argus nutzt jetzt drei Vermittlungsserver gleichzeitig (PeerJS, EMQX, HiveMQ). Ist einer gesperrt oder ausgefallen, läuft der Verbindungsaufbau über die anderen. Bild und Ton gehen weiterhin direkt von PC zu PC, über die Server laufen nur verschlüsselte Verbindungsdaten.

**Neu**
- Beim Zuschauer steht sofort „Code stimmt“, sobald die Anfrage beim Gegenüber angekommen ist. Kommt nach 15 Sekunden nichts, meldet Argus „Code nicht gefunden“.
- Übertragungsfenster → Einstellungen → „Verbindung zu den Servern testen“ zeigt, welche Server von diesem PC aus erreichbar sind. Bei einem Fehler nennt Argus jetzt jeden Server mit Grund.

Beide Seiten brauchen 0.59.1. Veröffentlichung ausschließlich im Testkanal `updates`; Stable bleibt unverändert.
