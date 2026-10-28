# Argus 0.58.22 – Portal-Start ohne unerwünschten Speicherdialog

Diese Version erscheint im Testkanal `updates`. Der stabile Kanal bleibt unverändert.

## Korrektur

Beim Start kann Argus die Portal-Anmeldeseite in einem unsichtbaren Fenster laden, um die bestehende Portal-Verbindung wieder aufzunehmen. Bisher konnten Download-Ereignisse aus diesem Hintergrundfenster den nativen „Speichern unter“-Dialog öffnen. Das entspricht dem gemeldeten Dialog zur Portal-Adresse mit dem Dateinamen „download“.

Die Portal-Sitzung fängt Downloads aus unsichtbaren oder nicht mehr zuordenbaren Portal-Fenstern jetzt vor dem Dialog ab. Andere Browser-/Widget-Sitzungen werden nicht pauschal gesperrt. Ein vom Nutzer angeklickter Download im ausdrücklich geöffneten, sichtbaren Portal bleibt möglich; Argus legt keinen automatischen Speicherpfad fest und öffnet keine heruntergeladenen Dateien.

Eine abgebrochene Startnavigation wird beim ausdrücklichen Öffnen des Portals erneut versucht. Bereits geladene Seiten behalten nach einem abgefangenen Hintergrunddownload ihren Zustand. Portal-Datenabfrage und Widget bleiben erhalten; die bestehende Sitzungsaufteilung wird nicht geändert.

## Nachweis und Grenzen

- Installierte und laufende Ausgangsversion wurde vor der Änderung als 0.58.21 festgestellt; die installierte Portal-Datei entsprach deren geprüftem Manifest. Die lokale Installation wurde nicht verändert.
- Mit einem vollständig frischen, anonymen Profil wurde die öffentliche Portal-Seite untersucht. Dabei folgten auf die nicht angemeldete API-Abfrage ein unsichtbares Fenster und eine normale HTML-Anmeldeseite; aktuell trat dort kein Download auf. Eine bestimmte fehlerhafte Antwort des Anbieters oder ein konkreter Zustand einer angemeldeten Sitzung ist deshalb **nicht** als Ursache behauptet. Original-Cookies oder Zugangsdaten wurden nicht übernommen.
- Die fehlende Absicherung wurde mit kontrollierten Antworten unter Electron 33.2.1 reproduziert: direkter Download, Weiterleitung auf einen Download und skriptgesteuerter Download aus einer bereits geladenen Hintergrundseite. Der unveränderte Code scheitert an der Regression; mit dem Fix bestehen 19 gezielte Prüfungen einschließlich Portal-Seite, Widget-Daten, Zustandserhalt und tatsächlichem Nutzer-Klick. Die Sicherheitsbeobachtung des Tests bricht auch erlaubte Testdownloads vor Dialog und Speicherung ab.
- Es werden durch den Fix keine Zugangsdaten, Cookies, vollständigen URLs mit Sitzungsparametern oder Sitzungsinhalte protokolliert. Die untersuchten Ereignisse stammen aus getrennten Testprofilen beziehungsweise künstlichen Antworten.
- Die bereits dokumentierten allgemeinen Menü-UI- und VM-Symlink-Testlücken aus 0.58.21 bleiben bestehen. Dieser gezielte Portal-Fix ist keine uneingeschränkte Freigabe aller UI-Funktionen und kein Test mit einer echten angemeldeten Portal-Sitzung.

Der Windows-x64-Installer und seine Prüfsummen stehen im Zweig `updates`. Bestehende Testkanal-Installationen können über den normalen Argus-Updater aktualisieren. Der Installer ist nicht signiert; die Veröffentlichung beruht auf Selbstprüfung, nicht auf einem unabhängigen Review.
