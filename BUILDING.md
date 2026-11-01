# Bauen und prüfen

Versionen: Electron 33.2.1, electron-builder 25.1.8, adm-zip 0.5.16. Aufgelöste npm-Abhängigkeiten sind in `package-lock.json` und `payload-source/package-lock.json` festgehalten.

Der Build verwendet eine vorhandene Windows-x64-Electron-Laufzeit mit den Argus-Abhängigkeiten und dem Discord-Redistributable. Als Runtime-Eingabe kann der Ordner `resources/diagnostic-payload` aus der installierten Diagnoseversion verwendet werden. Die JavaScript-Produktdateien werden dabei durch den versionierten Stand unter `payload-source/` ersetzt. Die benötigten Vendor-Binaries einschließlich Lizenzdateien werden unverändert übernommen.

1. Diesen Quellstand auschecken. In einer separaten Toolchain `npm ci` ausführen; für den Argus-Payload `npm ci --omit=dev` anhand seines Lockfiles verwenden, wenn dessen Runtime-Abhängigkeiten nicht bereits vorhanden sind. Electron selbst und der Discord-SDK-Helper sind externe Windows-Binaries; ihre Lizenzen liegen der Runtime bei.
2. `node prepare-build.cjs <Runtime-Eingabeordner> <Toolchain-Projektordner> <neuer-Buildordner>` ausführen. Der Zielordner muss neu sein. Der Runtime-Eingabeordner darf nicht das Originalprofil sein und wird nur gelesen.
3. Im Buildordner mit der externen Toolchain bauen: `node <Toolchain>/node_modules/electron-builder/cli.js --win nsis --x64 --publish never`. Ausschließlich lokale Artefakte erzeugen; niemals Update-Metadaten veröffentlichen.
4. `runner.test.cjs` in den Buildordner kopieren und dort `node --test runner.test.cjs` ausführen. Die Tests verwenden simulierte eigene Kindprozesse, prüfen frühe Abbrüche, Parallelitätssperre, Export und Datenschutzfilter.
5. Vor Veröffentlichung den vollständigen Installer in der gesicherten Windows-VM unter einem nicht erhöhten Benutzer installieren, echten 60-Sekunden-Lauf und Prozessabbruch über die Oberfläche testen, über den nativen Speicherdialog exportieren und deinstallieren. Originalinstallation, Originalprofil, Autostart und Uninstall-Registry vor/nachher per SHA-256 vergleichen. Die Veröffentlichung darf erst nach bestandener Prüfung erfolgen.

`validation/` dokumentiert das VM-Verfahren; es benötigt eine eigene Test-VM mit Node.js, dem WebSocket-Testmodul und aktiver Desktop-Sitzung. Ein lokaler Debugging-Port wird ausschließlich vom Teststarter gesetzt, niemals beim normalen Produktstart. Keine Testschalter oder automatischen Uploads im Produkt.

Release: eigener Branch und Tag, Prerelease, `make_latest=false`; nur Diagnose-Setup, SHA256.txt, Anleitung, Quellarchiv und Prüfbericht anhängen. Die normalen Update-Branches, `latest.yml` und Stable sind ausdrücklich ausgeschlossen. Die eigene GitHub-Veröffentlichung ist vom lokalen Build getrennt.


Stand diagnose.3: Die acht Runner-Tests muessen bestehen. Zusaetzlich beide Vergleichsmodi mit echter mitgelieferter Runtime jeweils 60 Sekunden pruefen (validation/comparison-smoke.cjs). Die bisherigen VM-/Release-Nachweise unter validation/ gelten nur fuer diagnose.2 und duerfen nicht als Nachweis fuer diagnose.3 wiederverwendet werden. Fuer eine Veroeffentlichung GUI-Auswahl, Einwilligung/Abbrechen, ZIP-Export und Installation ueber diagnose.2 erneut in der VM pruefen. Kein automatisches Publizieren durch den lokalen Build.

Details zu Abdeckung und Grenzen: INSTRUMENTIERUNG.md. Dump-Erfassung nicht ohne ausdrueckliche Einwilligung einschalten; auch im Test keine sensiblen Dumps exportieren.


Stand diagnose.4: Nach prepare-build im Zielordner npm ci --omit=dev --ignore-scripts ausf?hren (enth?lt den bestehenden electron-updater und seine Lockfile-Abh?ngigkeiten). Controller und Payload verwenden dieselbe canonical diagnostic-plan.cjs; prepare-build kopiert sie in den Payload. Eigene diagnostic-updater.yml wird nur als resources/app-update.yml des Controllers verpackt; produktive Updateadressen sind ausschlie?lich im strikten Diagnoseprovider definiert. Keine normalen latest.yml ver?ffentlichen.

Pr?fungen: node --test runner.test.cjs diagnostic-update.test.cjs (16 Tests); 16 echte Gruppenvergleiche je 60 Sekunden; bestehende VM mit normalem Benutzer f?r Upgrade/Offline/Downloadfehler/Checksumme/Berichtserhalt/GUI. Pr?fbericht f?r diagnose.4 enth?lt die konkreten Ergebnisse. Fr?here VM-Pr?fberichte nicht ?bernehmen. Das neue separate Release enth?lt argus-diagnostic-update.json mit App-ID, Installationskennung und SHA-512 des Diagnose-Setups. Keine automatischen Downloads oder Installationen beim Beenden.
