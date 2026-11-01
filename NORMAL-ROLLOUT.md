# Bedingte Dauerfreigabe ? aktualisiert fuer Diagnose .6

Bestaetigt: Prozessisolation schuetzt Argus bei nativem Helferabbruch 0xFFFF7003 am Verknuepfungszugriff. Akzeptierte Einschraenkung: Store-App-Erkennung kann bei Helferabbruch ausfallen. Der native Grundfehler ist nicht behoben. Eine vollstaendige Store-App-Wiederherstellung ist keine neue Freigabebedingung.

Offener Schritt: Kollege fuehrt einmal full-normal in Diagnose .6 aus: alle Diagnosegruppen und normale Hardwarebeschleunigung im Argus-Haupt-/Rendererprozess, 60 Sekunden, Ergebnis-ZIP. Keine Teilproben wiederholen. Ein Helferfehler ist akzeptiert, wenn Argus weiterlaeuft und unvollstaendige Ergebnisse abweist.

Danach ohne erneute grundsaetzliche Freigabefrage: beide readShortcutLink-Aufrufstellen im normalen actions.js in denselben isolierten Helfer portieren; findApp/launchCheck/launchApp und deren Aufrufer wie im Diagnosepaket asynchron uebernehmen. Produktiven separaten Helfereinstieg in boot.js vor Migration/Hauptmodulen einbauen und Helferdateien im normalen Build verpacken. Produktgeeigneten eigenen Helfer-Profilpfad und Namen verwenden, keine Diagnose-Uploads/Debugports uebernehmen.

Alle Pfad-/Kollisions-/Startpruefungen erhalten: Ziel, Argumente, cwd, harte/symbolische Links, gepruefte AppID-Menge, vollstaendige Antwort und normale Helferbeendigung. Quelldatei nach asynchroner Grenze erneut pruefen. Kein Auto-Retry; Hintergrundfehler sperrt weitere automatische Store-Pruefung fuer diese Sitzung. Bei unsicherem Leser/Quelle Freigaben invalidieren.

Danach normale Regressionstests (insbesondere tests/pathguard.test.js mit den jetzt asynchronen Testaufrufen, Guards gegen falsche AppIDs, partielle Ergebnisse, Verknuepfungsziele/Argumente/cwd und Quellwechsel), normalen Build und Installer in der VM pruefen. Erst bei bestandener Pruefung source und updates publizieren. Stable nicht veraendern. Bis dahin bleibt der normale Arbeitsstand unveraendert und unveroeffentlicht.
