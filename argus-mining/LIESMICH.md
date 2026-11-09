# Argus Mining

Kleines eigenständiges Programm für den PC vor Ort. Ersetzt Foreman/Pickaxe für die Überwachung: fragt die Miner im eigenen Netz direkt ab und schreibt einen Tagesreport je Miner. Kein Argus, keine Kugel, kein Konto, keine Cloud.

## Was es liest (nur lesend, Port 4028)

| Wert | Antminer Stock | VNISH | Whatsminer |
|---|---|---|---|
| Online / Hashrate / Nennwert | ja | ja | ja |
| Temperatur, Lüfter | ja | ja | ja |
| Mining-Laufzeit (Hashing-Uptime) | ja | ja | ja |
| Geräte-Laufzeit | nein | ja (Web-Schnittstelle) | ja |
| Verbrauch | geschätzt (Hashrate × J/TH) | gemessen, falls die Web-Schnittstelle antwortet, sonst geschätzt | gemessen |

Geschätzte Werte stehen grau da und sind im Report getrennt ausgewiesen.

## Einrichten

1. `Argus-Mining.exe` irgendwo ablegen (z. B. `C:\Argus Mining`) und starten. Windows fragt beim ersten Start evtl. nach der Firewall: „Privates Netzwerk“ erlauben.
2. Der Browser öffnet `http://localhost:8420`. Unter **Einstellungen** die Adressbereiche eintragen (eine Zeile je Bereich, wie in Foreman), **Speichern**.
3. Die Suche läuft sofort (rund 20 Sekunden für 5000 Adressen), danach alle 30 Minuten. Abgefragt wird jede Minute, der Report nimmt alle 5 Minuten eine Stichprobe.
4. **Mit Windows starten** anhaken, damit es nach einem Neustart weiterläuft.

Das schwarze Fenster offen lassen (minimieren reicht). Schließen beendet das Programm.

## Tagesreport

Reiter **Tagesreport**: je Miner Uptime (Anteil der Stichproben mit Hashrate, wie Foreman), Verbrauch in kWh, Ø Hashrate, Neustarts, Laufzeiten. **Als CSV speichern** gibt eine Excel-Datei. Lücken (PC aus) zählen nicht mit. Daten bleiben 30 Tage in `%APPDATA%\Argus Mining`.

## Fernzugriff (optional, aus)

Eingeschaltet können andere Geräte die Daten lesen: `http://<PC-IP>:8420/api/status?token=…`, `/api/report?day=JJJJ-MM-TT`, `/api/report.csv?day=…`. Der Schlüssel steht in den Einstellungen. Einstellungen ändern geht nur am PC selbst.

## Wenn Miner fehlen

- Whatsminer: In neueren Firmwares muss die API im WhatsMinerTool freigeschaltet sein.
- VNISH: Die API auf Port 4028 ist normal an. Für gemessene Watt die Web-Schnittstelle; sperrt VNISH sie, das Web-Passwort in den Einstellungen eintragen.
- Läuft der PC in einem anderen Netz als die Miner, findet er nichts: „keine Verbindung zu den Minern“ oben rechts.

## Bauen

`node build.js <node.exe für Windows x64>` (gleiche Node-Version wie die bauende, getestet mit 22.23.4; Signatur vorher mit `osslsigncode remove-signature` entfernen). Tests: `node --test test/`.
