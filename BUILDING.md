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
