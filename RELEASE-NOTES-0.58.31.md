# Argus 0.58.31 – Fehlerberichte und Kugel

**Fehlerberichte**
- Ein kopierter Bericht gilt jetzt als bestätigt und erscheint nicht bei jedem Start erneut. Bereits in der Historie gespeicherte Berichte werden beim ersten Start einmalig als bestätigt übernommen. Der alte Stand wird vorher gesichert, die Historie bleibt erhalten.
- Jeder Bericht nennt die Argus-Version zum Ereigniszeitpunkt getrennt von der aktuellen Version. Bei älteren Berichten steht dort „nicht erfasst“.
- Abgefangene Netzfehler, zum Beispiel HTTP 503 von Open-Meteo, werden einem unsauberen Ende nicht mehr beigefügt. Ältere Berichte blenden die damals angehängten Protokollzeilen aus.
- Jedes unsaubere Ende wird weiterhin erfasst, auch wenn ein ähnlicher Bericht offen ist oder „nicht mehr melden“ gewählt wurde.

**Kugel bei inaktivem Fenster**
- Die Drehung folgt der verstrichenen Zeit. Ihr Tempo hängt nicht mehr von der Bildrate ab.
- „Darstellung im Hintergrund“ ist jetzt mit dem Hauptfenster verbunden. Bei „Flüssig“ bleibt eine gewählte Ruhe-Bildrate über 15 auch im inaktiven Fenster erhalten. Die Stufe 15 läuft wie bisher, die Last steigt dort nicht.
- Minimierte und ausgeblendete Fenster zeichnen nichts mehr und laufen danach ohne Sprung weiter.

**Kugel auf der Mining-Seite**
- Argus erkennt, wenn die Kugel hinter einem undurchsichtigen Fenster liegt, und bietet „Wieder sichtbar machen“ an: als Hinweis, in den Einstellungen und im Rechtsklick-Menü.
- Dabei ändert sich nur die Kugel der aktuellen Seite (Position, falls nötig auch Größe). Fenster, Anzeigen und andere Seiten bleiben unverändert. Ohne Klick wird nichts verschoben. Strg+Z nimmt es zurück.

**Bekannte Einschränkungen**
- Ein Windows-Systemende, bei dem Argus keine Nachricht mehr erhält, wird weiterhin als unsauberes Ende gemeldet.
- Bei fokussiertem Fenster gilt nach einer Minute ohne Eingabe bei den sparsamen Stufen weiter die Grenze von 10 Bildern pro Sekunde.
- Sprachaktivierung bei ausgeblendetem Fenster wurde ohne Mikrofon nicht geprüft.

Veröffentlichung ausschließlich im Testkanal `updates`; Stable bleibt unverändert.
