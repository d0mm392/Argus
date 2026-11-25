# Argus 0.59.7 – YouTube-Absturz behoben (Werbefilter)

**Behoben**
- Bei manchen YouTube-Videos stürzte Argus komplett ab. Ursache war der Werbe- und Trackingfilter: Er ersetzte einzelne Werbeskripte durch einen leeren Platzhalter, also eine Umleitung. Trifft so eine Umleitung auf eine Anfrage, die YouTube gerade selbst weiterleitet, stürzt Electron (der Unterbau von Argus) im Hauptprozess ab. Das zeigten die Absturz-Abbilder aus der Diagnose eindeutig.
- Der Filter leitet jetzt nichts mehr um, er blockiert solche Anfragen nur noch. Werbung und Tracking bleiben draußen, der Absturzweg ist weg.

**Hinweis**
- Wer den Filter wegen des Absturzes ausgeschaltet hat, kann ihn unter Einstellungen › Freunde und Medien › YouTube wieder einschalten.
- Hat Argus nach einem Absturz die Hardware-Videodekodierung abgeschaltet, lässt sie sich unter Einstellungen › System › Leistung wieder einschalten.
