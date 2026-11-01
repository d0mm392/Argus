# Gezielte Untersuchung actions.refreshExtra / Diagnose .5

Befund vom Kollegen: core und stage-1 stabil. core-apps, C2 und C4 brechen nach actions.refreshExtra, PowerShell-Kindprozess Exit 0, unmittelbar mit 0xFFFF7003 ab. refreshExtra bleibt als unerledigtes Promise erfasst. Dieser Befund grenzt auf die App-Erkennung ein; GPU/YouTube/Discord oder andere Gruppen werden daraus nicht als Ursache abgeleitet.

## Tats?chliche Reihenfolge

refreshExtra sammelt vor dem await bereits Steam-/Epic-/Battle.net-Metadaten. storeApps startet die vorhandene PowerShell-Abfrage: Get-AppxPackage/Get-AppxPackageManifest und Get-StartApps. Das native Prozessereignis exit ist nicht gleich dem execFile-Callback: Der Callback folgt nach Ende der Ausgabestr?me. Erst dann: verifiedAppIds l?schen; JSON.parse; Schemafilter; shortcutAppIds; gesch?tzte Startmen?-/Desktopsuche; files.checkPath f?r jede .lnk; shell.readShortcutLink; appUserModelId lesen; Kollisionsfilter; gepr?fte IDs speichern; Ergebnis abbilden und das Promise aufl?sen. Danach setzt refreshExtra extraApps. Der Kindprozess kann also erfolgreich beendet sein, w?hrend der aufrufende Prozess noch im synchronen nativen Verkn?pfungsleser steckt. Ein offenes Promise beweist keinen Fehler der Promise-Implementierung.

Neue Marker vor/nach Callback-Zust?nden, JSON/Schema, Root-/Verzeichnis-/Dateipr?fung, nativem Leseaufruf, R?ckkehr des Aufrufs, Zugriff auf appUserModelId, Filter/Cache/Mapping/resolve und Fortsetzung von refreshExtra. Nur Bytezahlen, Anzahlen, boolesche Zust?nde und laufende Datei-/Verzeichnisnummern. Keine Programmnamen, App-ID-Listen, Rohantworten, Fehlermeldungen oder privaten Pfade. Fehlender Nach-Marker ist eine Grenze, kein alleiniger Ursachenbeweis. Insbesondere kann jeder native Aufruf den Prozess verlassen, ohne einen JavaScript-Catch zu erreichen.

## Gezielte Modi ? jeweils core + apps, ohne Hardwarebeschleunigung

P0. App-Erkennung: nur PowerShell-Callback
P1. App-Erkennung: Callback + JSON, ohne Verknuepfungen
P2. App-Erkennung: Pfadpruefung, ohne native Aufloesung
P3. App-Erkennung: native Aufloesung im Hilfsprozess (Korrektur)
P4. App-Erkennung: bisherige native Aufloesung im Hauptprozess

P0/P1/P2 geben absichtlich keine Store-App-IDs frei. P4 erh?lt den gef?hrdeten bisherigen Zugriff nur als gezielte Restgegenprobe; nicht routinem??ig erneut starten. Alle bestehenden Diagnosemodi mit apps verwenden in .5 standardm??ig die P3-Korrektur. C6 bezeichnet nun korrekt Steam; C7 weiterhin Netzwerk.

Kollege: zuerst P1. Bei Abbruch P0, dann ZIPs zur?ck; nicht P2/P3 verlangen. L?uft P1 stabil, P2. Bei dessen Abbruch ZIPs zur?ck; keine weitere native Probe n?tig. Laufen beide stabil, P3. P4 zun?chst nicht erforderlich, da der bisherige Abbruch bereits belegt ist. Nach jedem Lauf ZIP exportieren, anschlie?end gesammelt zur?ckschicken. Keine weiteren C-Gruppen wiederholen. Kein Dump ohne ausdr?ckliche Einwilligung.

## Korrekturvorschlag und Sicherheitsgrenzen

Der synchrone native Hintergrund-Leseweg wird in einen einzelnen separaten Prozess derselben mitgelieferten Electron-Laufzeit ausgelagert. Der Hauptprozess durchsucht und pr?ft Pfade wie bisher. Der Helfer pr?ft jeden Pfad direkt vor dem Zugriff erneut. IPC l?uft nur lokal ?ber eine zuf?llige Windows-Named-Pipe mit einem einmaligen 256-Bit-Token, nicht ?ber Internet oder private Protokolldateien. Auf Nicht-Windows-Systemen verwendet der interne Testtransport ausschlie?lich Loopback. Listen/Pfade bleiben im authentifizierten Kanal und werden nicht ins Protokoll geschrieben. Die Windows-Electron-GUI-Laufzeit liefert umgeleitete stdin nicht zuverl?ssig; daher kein stdin-Protokoll.

Genau ein Helferstart je Abfrage, keine Wiederholung. 15 Sekunden Gesamtlimit, maximal 1.000 gepr?fte Verkn?pfungen, begrenztes Protokoll. Fremde/unberechtigte Verbindungen und ung?ltige Antworten werden abgewiesen. Ergebnisse gelten erst nach g?ltiger Antwort UND normalem Helferabschluss. Exit 0 allein gen?gt nicht. Fehler, Timeout, Absturz, unvollst?ndige Suche oder unbekannte Kollisionen autorisieren keine Store-App-ID. Gesch?tzte Quellen werden nicht umgangen; launchCheck, Ziel-/Argument-/Arbeitsordnerpr?fung und Start-Positivliste bleiben erhalten. Der native Zugriff in launchCheck bleibt vorerst unver?ndert und zus?tzlich markiert; hier wird kein Programm gestartet.

Auch wenn die Suche unvollst?ndig ist, werden ihre zul?ssigen gesammelten Verkn?pfungen im Helfer untersucht, um den nativen Pfad tats?chlich beobachten zu k?nnen. Die abschlie?ende Freigabe bleibt dennoch gesperrt. Ein stabiler Hauptprozess mit abgest?rztem Helfer oder unvollst?ndiger Kollisionspr?fung ist nur sichere Fehlerbegrenzung, keine best?tigte vollst?ndige Wiederherstellung der Store-App-Erkennung. Oberfl?che und Ergebnis.json unterscheiden dies. Eine unver?ndert fehlerhafte Verkn?pfung kann weiterhin den Helfer beenden. Die konkrete native Ursache bleibt ohne passende letzte Marker oder Dump offen; try/catch ist kein Schutz gegen native Prozessabbr?che.

shortcut-worker-markers.jsonl wird zus?tzlich in den begrenzten ZIP-Bericht aufgenommen. Darin stehen nur Phasen und Nummern. Optionale Speicherabbilder bleiben nach ausdr?cklicher Einwilligung pro Lauf ausschlie?lich lokal unter profile/local-dumps, niemals im Bericht und ohne Upload.

## Freigabe

Nur separates Diagnose-Prerelease .5 f?r die R?ckmeldung des Kollegen. Noch keine best?tigte Korrektur auf seiner Hardware. Normale actions.js und normales boot.js bleiben unver?ndert. Erst nach erfolgreicher Best?tigung des korrigierten Ablaufs/Funktionsumfangs folgen Portierung, normaler Build und Regressionstests sowie die bereits autorisierte Ver?ffentlichung auf source/updates. Stable bleibt unver?ndert. Daf?r ist keine erneute grunds?tzliche Freigabe n?tig; die technische Best?tigung steht noch aus.
