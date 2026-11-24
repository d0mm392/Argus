# Argus 0.59.6 – Diagnose vollständig

**Behoben**
- „Diagnose speichern“ hat in 0.59.5 die Absturz-Abbilder nicht in die Zip gepackt. Jetzt sind die drei neuesten dabei, und `system.json` nennt Größe und Zeit jedes Abbilds bzw. warum eines fehlt.

**Neu**
- Argus schreibt zusätzlich das Protokoll des Browser-Unterbaus (Chromium, nur Warnungen und Fehler) in `chromium.log`. Der vorige Lauf bleibt als `chromium.prev.log` erhalten. Bei harten Abstürzen steht dort oft die letzte Meldung. Beides ist in der Diagnose-Zip enthalten.
- Die Blackbox vermerkt mehr YouTube-Schritte: Navigation, fehlgeschlagenes Laden, Wiedergabe startet oder pausiert, Vollbild und „reagiert nicht“.
