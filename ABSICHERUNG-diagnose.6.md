# Prozessisolation und abschliessender Gesamtlauf ? Diagnose .6

## Bestaetigt

Beim Kollegen: P1/P2 stabil; P3-Helfer Exit 0xFFFF7003 nach apps:worker.native:before, Index 38 und erfolgreicher Pfadpruefung. Argus selbst bleibt am Leben. Die Prozessgrenze wirkt als Absturzabsicherung. Der native Grundfehler in/unter shell.readShortcutLink ist nicht behoben; eine genauere interne Ursache wird daraus nicht behauptet. Store-App-Erkennung darf bei Helferabbruch ausfallen; unvollstaendige Kollisionsdaten werden weiterhin komplett abgelehnt.

## Audit aller Aufrufwege

Die Anwendungsquellen haben zwei urspruengliche Aufrufstellen in actions.js: shortcutAppIds (Hintergrund-Kollisionspruefung) und launchCheck. launchCheck wird sowohl von findApp fuer die Auswahl als auch von launchApp direkt vor einem Start verwendet. Beide Rollen koennen denselben nativen Prozessabbruch ausloesen. Weitere Anwendungscallstellen wurden in Root und app/ nicht gefunden. Historische Testfixtures/alte Releases werden nicht umgeschrieben.

In der korrigierten Diagnose .6 existiert shell.readShortcutLink nur noch einmal: im separaten shortcut-worker.cjs. Hintergrundsuche und Programmstart-Aufloesung verwenden denselben lokalen authentifizierten, begrenzten Helfertransport. Die unsichere P4-Hauptprozess-Gegenprobe wurde entfernt. findApp, launchCheck und launchApp arbeiten dafuer asynchron; run wartet beide Auswahl-/Startpfade ab.

Vor und im Helfer bleiben Pfadpruefungen erhalten. Nach der asynchronen Aufloesung wird die Quelldatei erneut geprueft (realer Pfad und dev/ino/size/mtimeMs). Danach unveraendert: erlaubtes ausfuehrbares Ziel, keine voreingestellten Verknuepfungsargumente, gepruefter Arbeitsordner und Start nur des geprueften Ziels. Kein Start der Verknuepfung selbst. Unvollstaendige/ungueltige Antwort oder abnormaler Helferabschluss lehnt den Start ab. Unsicherheit bei Leser/Quelle loescht auch vorherige Store-App-Freigaben. Ein Helferfehler beendet die Kandidatensuche fuer diese Anfrage; kein automatisches Durchprobieren mit immer neuen Helfern.

Die automatische Hintergrund-Store-Suche wird nach einem Leserfehler fuer die laufende Sitzung gesperrt. Keine Helfer-Neustart- oder Wiederholungsschleife. Eine explizite spaetere Programmanfrage kann ihren eigenen einzelnen begrenzten Leseauftrag ausloesen; nach Fehler kein automatischer Retry. Ein normaler Auswahl-/Startvorgang kann nach erfolgreicher Auswahl fuer die erneute Sicherheitspruefung am Startzeitpunkt nochmals lesen. Das ist keine Wiederholung eines fehlgeschlagenen Auftrags. Der Helfer startet niemals Programme.

Private Ziel-/Argument-/Arbeitsordnerfelder fuer den Start werden ausschliesslich im lokalen authentifizierten IPC-Kanal uebertragen, nicht protokolliert. Das Protokoll prueft Operation, Anzahl, Vollstaendigkeit, Feldtypen und Laengen; partielle Antworten sind unzulaessig. Nur Nummern/Zustaende/Anzahlen in Markern. Dumps weiterhin nur lokal nach ausdruecklicher Einwilligung und niemals im ZIP/Upload.

## Einziger naechster Lauf beim Kollegen

Diagnose auf .6 aktualisieren. Auswaehlen:

Vollstaendige Argus-Diagnose mit Absicherung (normale Hardwarebeschleunigung)

Einmal starten, 60 Sekunden abwarten, danach Ergebnis-ZIP speichern und zurueckschicken. P1/P2/P3 und einzelne C-Gruppen nicht wiederholen. Dumps dafuer nicht aktivieren. Dieser Modus schaltet alle sieben Diagnosegruppen zu: desktop, apps, integrations, local, index, steam, network. Er deaktiviert die Hardwarebeschleunigung des Argus-Haupt-/Rendererprozesses nicht. Ein Helferabbruch allein ist unter der akzeptierten Einschraenkung zulaessig; Argus muss weiterlaufen und unvollstaendige Ergebnisse verwerfen.

Es ist der volle bestehende Diagnoseumfang mit frischem isoliertem Profil, nicht das Originalprofil: Medien bleiben aus, Autostart/normaler Updater und lokale KI-Installation bleiben uneingerichtet. Dadurch keine Host-/Treiber-/Schutzfunktionsaenderungen. Der fensterlose reine Verknuepfungshelfer behaelt seine bisherige Einstellung ohne GPU; dies deaktiviert nicht die Beschleunigung des Argus-Fensters.

Ergebnis.json: mode=full-normal, hardwareAccelerationDisabled=false, plan.groups enthaelt alle sieben Gruppen. Laufzeitabfrage hardwareAccelerationObserved kann null sein: Electron 33 stellt die abgefragte Methode hier nicht bereit. Null bleibt unbekannt und wird nicht als false oder Ausschluss eines GPU-Fehlers dargestellt. Die normale Startvorgabe ist durch den Modus und das frische Profil dokumentiert; keine Treiber-/GPU-Regeln werden erzwungen.

## Freigabestatus

Die Grundsaetze der Isolation und des akzeptierten Store-App-Ausfalls sind vom Nutzer bestaetigt. Vor normaler Veroeffentlichung fehlt noch der Kollegen-Gesamtlauf mit normaler Beschleunigung. Danach folgen die produktive Portierung, normalen Regressionstests und Installerpruefungen. Bei bestandenen Pruefungen gilt die Dauerfreigabe fuer source/updates; Stable bleibt unveraendert. Der normale Arbeitsstand mit seinen zwei bisherigen Aufrufstellen ist bis dahin nicht veroeffentlicht/geaendert worden. Diagnose .6 ist das vorbereitete Pruefpaket, keine normale Argus-Veroeffentlichung.
