# Bedingte Dauerfreigabe

Status: WARTET AUF BEST?TIGUNG DES KOLLEGEN F?R DIAGNOSE .5.

Autorisiert: nach erfolgreicher Best?tigung den validierten Ansatz in normales Argus portieren, normalen Build und Regressionstests ausf?hren und auf source/updates ver?ffentlichen. Stable unver?ndert. Keine erneute grunds?tzliche Freigabe erfragen.

Bis zur Best?tigung keine normalen Branches/Updater-Assets ver?ndern. P3-Hauptprozess stabil bei Helferabbruch/unvollst?ndiger Kollisionspr?fung ist allein kein Beleg f?r vollst?ndige funktionale Wiederherstellung. Die Resultate und der gew?nschte Funktionsumfang m?ssen bewertet werden. Nicht stillschweigend Pfad-/Kollisions-/Programmstartpr?fungen entfernen. Das normale actions.js/boot.js wurde in dieser Phase nicht ge?ndert.

Diagnose?nderungen: source/payload-source/actions.js, shortcut-reader.cjs, shortcut-worker.cjs und separater Einstieg in boot.js. Die sp?tere normale Integration muss Diagnosepfade/App-Namen/Umgebungsvariablen durch produktiv geeignete isolierte Helferpfade ersetzen; keine Debugports oder Diagnose-Uploads ?bernehmen. Danach insbesondere tests/pathguard.test.js mit abgelehnten/gef?lschten AppIDs und vollst?ndiger/unvollst?ndiger Suche sowie normale Paket-/Updater-Regressionspr?fungen durchf?hren.
