# Argus 0.58.32 – Flüssiger Hintergrund

**Bewegter Hintergrund**
- „Bildrate in Ruhe“ gilt jetzt wie beschrieben auch für den Hintergrund. Bisher fiel er ohne Eingabe auf 24 und nach einer Minute auf 10 Bilder pro Sekunde, auch bei der Einstellung 60.
- Bei „Flüssig“ bleibt die gewählte Rate erhalten: 30 bleibt 30, 60 wird 60. Die Stufe 15 und „Energiesparend“ behalten ihre bisherigen Grenzen.
- Im Farbmodus „bunt“ legt der Hintergrund nach einer Farbrunde keine neuen Zeichenflächen mehr an.

**Gleichmäßige Bildrate bei mehreren Bildschirmen**
- Der Animationstakt folgt oft dem Hauptbildschirm. Bei 144 Hz wurden aus eingestellten 60 Bildern nur 48, und auf einem 60-Hz-Bildschirm wiederholte sich dadurch alle fünf Bildwechsel ein Bild. Kugel und Hintergrund erreichen jetzt im Schnitt die gewählte Rate.

**Auswirkung auf die Last**
- Wer 60 gewählt hat, bekommt sie jetzt tatsächlich, das kostet etwas mehr CPU und GPU. Bei hohem Bildschirmtakt steigt die Rate während der Bewegung ebenfalls von rund 48 auf die eingestellten 60. Die Stufe „15 (sparsam)“ bleibt in Ruhe unverändert.

Veröffentlichung ausschließlich im Testkanal `updates`; Stable bleibt unverändert.
