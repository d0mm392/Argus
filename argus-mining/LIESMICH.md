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

Zur eindeutigen Zuordnung je Miner außerdem:

| Wert | Antminer Stock | VNISH | Whatsminer |
|---|---|---|---|
| Pools 1–3 (Adresse, Worker, Zustand) | ja | ja | ja |
| Seriennummer | über die Weboberfläche (Login root/root, änderbar), nur neuere Firmware | wenn die Web-Schnittstelle sie meldet | ja (`get_miner_info`) |
| MAC | Weboberfläche oder ARP-Tabelle | Web-Schnittstelle oder ARP | ja |

Seriennummer und MAC werden bei jeder Suche (alle 30 Minuten) gelesen, nicht jede Minute. Klick auf eine Zeile zeigt Pools 1–3 und MAC.

## Einrichten

1. `Argus-Mining.exe` irgendwo ablegen (z. B. `C:\Argus Mining`) und starten. Windows fragt beim ersten Start evtl. nach der Firewall: „Privates Netzwerk“ erlauben.
2. Der Browser öffnet `http://localhost:8420`. Unter **Einstellungen** die Adressbereiche eintragen (eine Zeile je Bereich, wie in Foreman), **Speichern**.
3. Die Suche läuft sofort (rund 20 Sekunden für 5000 Adressen), danach alle 30 Minuten. Abgefragt wird jede Minute, der Report nimmt alle 5 Minuten eine Stichprobe.
4. **Mit Windows starten** anhaken, damit es nach einem Neustart weiterläuft.

Das schwarze Fenster offen lassen (minimieren reicht). Schließen beendet das Programm.

## Detailansicht je Miner

Klick auf einen Miner öffnet seine Seite: Modell, IP, MAC, Seriennummer, Firmware, Worker, Laufzeiten, Verbrauch; Hashrate-Verlauf (24 h alle 5 Minuten, 7 Tage stündlich, 30 und 90 Tage täglich, Nennwert gestrichelt); Aktivität der letzten 30 Tage (offline, zurück, Neustart, niedrige Hashrate, heiß); Hashboards (Hashrate, Chips, defekte Chips, Frequenz, Temperatur); alle Temperatursensoren und Lüfter; alle Pools mit angenommenen, abgelehnten und veralteten Shares. Sensoren, Hashboards und Shares werden beim Öffnen live gefragt und alle 30 Sekunden erneuert.

## Filter

Über der Minerliste: worin gesucht wird (alle Felder, Seriennummer, Worker/Pool, IP, MAC, Name), Suchtext (mehrere Werte mit Komma, z. B. eine Liste von Seriennummern), Zustand (läuft, offline, auffällig, ohne Seriennummer) und Modell.

## Report (Tag und Monat)

Reiter **Report**, oben Tag oder Monat wählen: je Miner Seriennummer, Worker, Uptime (Anteil der Stichproben mit Hashrate, wie Foreman), Verbrauch in kWh, Ø Hashrate, Neustarts, Laufzeiten. **Als CSV speichern** gibt eine Excel-Datei. Lücken (PC aus) zählen nicht mit. Der Monatsreport fasst alle Tage des Monats je Miner zusammen; Miner mit Seriennummer bleiben ein Eintrag, auch wenn sie die IP wechseln. Daten bleiben 90 Tage in `%APPDATA%\Argus Mining\report`.

## Protokoll

Reiter **Protokoll**: je Tag, was passiert ist (Miner offline nach zwei Abfragen ohne Hashrate, wieder online, Gerät oder Mining neu gestartet, Verbindung zu den Minern weg, Suche, Updates). Filterbar und als Text speicherbar. 90 Tage aufbewahrt in `%APPDATA%\Argus Mining\logs`.

## Updates

Argus Mining prüft beim Start und alle 6 Stunden, ob es eine neue Version gibt, und installiert sie automatisch (abschaltbar unter Einstellungen). Die neue exe wird nur übernommen, wenn ihre Prüfsumme stimmt. Danach startet das Programm von selbst neu, Einstellungen und Report bleiben.

## Fernzugriff (optional, aus)

Eingeschaltet können andere Geräte die Daten lesen: `http://<PC-IP>:8420/api/status?token=…`, `/api/report?day=JJJJ-MM-TT`, `/api/report.csv?day=…`. Der Schlüssel steht in den Einstellungen. Einstellungen ändern geht nur am PC selbst.

## Wenn Miner fehlen

- Whatsminer: In neueren Firmwares muss die API im WhatsMinerTool freigeschaltet sein.
- VNISH: Die API auf Port 4028 ist normal an. Für gemessene Watt die Web-Schnittstelle; sperrt VNISH sie, das Web-Passwort in den Einstellungen eintragen.
- Läuft der PC in einem anderen Netz als die Miner, findet er nichts: „keine Verbindung zu den Minern“ oben rechts.

## Bauen

`node build.js <node.exe für Windows x64>` (gleiche Node-Version wie die bauende, getestet mit 22.23.4; Signatur vorher mit `osslsigncode remove-signature` entfernen). Tests: `node --test test/`.
