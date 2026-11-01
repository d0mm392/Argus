# Eingrenzung diagnose.4

Ausgangsbefund vom Kollegen: minimal 60 s, vom Controller beendet; Argus ohne Hardwarebeschleunigung nach ca. 10,7 s mit 0xFFFF7003, nicht vom Controller beendet. Keine regul?ren Exitmarker oder JS-Fehlermeldungen. Das trennt den Minimalpfad vom umfangreicheren Argus-Pfad. Es beweist keine Ursache in GPU, YouTube, Discord oder einer bestimmten Bibliothek.

## Verz?gerte Arbeiten vor dem Abbruch

Die Quellpr?fung und die neue Laufzeitinstrumentierung zeigen:

| Zeitpunkt nach Planung | Arbeit | Gruppe |
| --- | --- | --- |
| 2,5 s / 15 s | KI-Status, lokale Statusabfragen | local |
| 3 s | Randbeobachtung / Desktopfunktionen | desktop |
| 3 s | Wiederherstellung gemerkter Medienfenster (im frischen Profil leer) | integrations |
| 5 s bereits ab Modulimport | actions.refreshExtra: Steam/Epic/Windows-App-Erkennung; PowerShell Get-AppxPackage/Get-AppxPackageManifest/Get-StartApps | apps |
| 5 s periodisch | Steam-Downloadstatus, Registry-Abfrage | steam |
| 6 s / 15 s | Strata-Pr?fung; im frischen Profil kein Strata-Start | local |
| 8 s | files.build: asynchrones Dateiverzeichnis, Callback und zur?ckgegebenes Promise | index |
| 2,5?6 s | Pool/Netz, News, Wetter, soziale Abfragen, Kursverlauf | network |

Die Zeiten beziehen sich auf die jeweilige Timerplanung, nicht immer auf den Prozessstart. Renderer, IPC, Promise-Fortsetzungen und Kindprozesse k?nnen zus?tzlich Arbeiten ansto?en. Beispielsweise kann die Einrichtungsoberfl?che die PC-Ausstattung abfragen (nvidia-smi/PowerShell); diese Abfrage geh?rt nun zu local. Kein Sicherheitsdienst und keine Schutzfunktion werden abgeschaltet. Der Dateiindex liest wie bisher unter Beachtung der vorhandenen Pfadschutzpr?fung; er schreibt ausschlie?lich ins isolierte Profil und wird nicht exportiert.

## Vergleichsplan

Alle neuen Modi verwenden 60 Sekunden ab Controllerstart, ein einzigartiges Laufprofil, genau einen Start und deaktivierte Hardwarebeschleunigung. Der bisherige Minimaltest und die Argus-Vergleiche bleiben erhalten. Die tats?chlich aktivierte Gruppenliste und Laufzeitversion stehen als plan-Marker und in Ergebnis.json.

A / modules: Argus-Modulimporte, Registrierung der Main-Handler und Minimalfenster; keine automatischen Hintergrundgruppen. Es ist kein reiner Import ohne Nebenwirkungen: Electron-/Node-Initialisierung und die Registrierung von Handlern bleiben Teil dieses Vergleichs.
B / core: zus?tzlich echte Argus-Oberfl?che, lokaler HTTP-Server, Preload, Renderer, Fensterform/Geometrie und Cursorbeobachtung. Die Oberfl?che enth?lt eigene Timer und IPC; dies ist bewusst Teil der Fenstergruppe.
C1: + desktop (Tray, Randbeobachtung, Shortcut).
C2: + apps (verz?gerte App-/Spieleerkennung).
C3: + integrations (Konto-/Bot-/Medien-/Portal-/ioBroker-/Foreman-Initialisierung; Konfigurationsschalter des frischen Profils bleiben erhalten).
C4: + local (Sprachmodellvorbereitung, KI-/Strata-Status, PC-Abfrage; lokale KI-Installation bleibt durch setupDone=false wie bisher uneingerichtet).
C5: + index (Dateiverzeichnis ab 8 s).
C6: + steam (Downloadstatusabfragen).
C7: + network (Lagebild, Wetter, Kurse und soziale Netzwerkabfragen).

Die Einzelmodi core-<Gruppe> erg?nzen nur die betreffende Gruppe zum Fenster. Bei einem ?bergang zum Abbruch die neu hinzugekommene Gruppe allein vergleichen. Ein nur kumulativ auftretender Fehler kann eine Wechselwirkung zeigen; ein stabiler Einzelvergleich schlie?t die Gruppe daher nicht aus. Deaktivierte Integrationen werden nicht k?nstlich mit Konten/Medien aktiviert. Keine produktiven Profile oder Anmeldedaten werden ?bernommen.

## Aussagekraft der Marker

- task:begin und task:return: Aufrufbeginn/R?ckkehr, mit eindeutiger Task-ID. Kein Beleg f?r abgeschlossene Hintergrundarbeit.
- task:resolved/rejected: nur das beobachtete zur?ckgegebene Promise ist abgeschlossen/fehlgeschlagen. Nicht zur?ckgegebene Unterarbeiten k?nnen weiterlaufen.
- timer:scheduled: Timer-ID, Art, Verz?gerung, Quellstelle und Callbackname; task-Marker zeigen erste Ausf?hrungen. Hochfrequente Intervalle werden nach den ersten zwei Aufrufen nur bei jedem 600. Aufruf markiert. Nicht vollst?ndige Zeitablaufaufzeichnung.
- background:spawn/started/exit/error: eigene gestartete OS-Prozesse, PID und Exitcode, keine Argumente/Prozessausgaben im Marker. Prozessende ist kein Beleg f?r den Abschluss aller logischen Arbeiten.
- module:<Name> und native:<Addon>: synchroner Import bzw. .node-Ladevorgang. Electron/Chromium-native Initialisierung vor dem Hook und ESM-/direkte native Pfade sind damit nicht vollst?ndig abgedeckt.
- index:callback: bekannter Callback mit Anzahl/Fehlerflag. Keine Dateinamen oder Inhalte im Bericht.

Die Beobachtung von Promises h?ngt einen Abschluss-Observer an; dies kann das Verhalten unbehandelter Rejections beeinflussen. Auch die zus?tzlichen Error-Listener f?r Kindprozesse k?nnen deren unbehandeltes Error-Ereignis-Verhalten ?ndern. Es werden keine Exceptions abgefangen und verschluckt; synchrone Fehler werden nach dem Marker weitergeworfen. Die Instrumentierung selbst ver?ndert Timing. Marker-Schreibfehler, Logbegrenzung und harte Hauptprozessabbr?che bleiben m?gliche L?cken. Ergebnis.json enth?lt beobachtete noch offene Promises und die letzten Lifecycle-Ereignisse. Fehlende Fehler-/Native-/Dump-Marker bleiben unbekannt und sind kein Ausschluss.

Optionale Dump-Erfassung: unver?ndert pro Lauf erst nach ausdr?cklicher Einwilligung des Kollegen, nur lokal ?ber Crashpad mit uploadToServer:false, niemals im ZIP-Bericht. Keine WER-/Registry-/Treiber?nderung. Dumps k?nnen sensible Speicherinhalte enthalten; fehlender Dump ist kein Negativnachweis.
