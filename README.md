# Argus 0.58.22 (Testkanal)

Fix fuer unerwuenschte Speicherdialoge aus dem unsichtbaren Portal-Startfenster. Downloads im ausdruecklich geoeffneten Portal bleiben moeglich. Stable bleibt unveraendert.

[Versionshinweise und Nachweisgrenzen](RELEASE-NOTES-0.58.22.md) ? [Windows-Download und Pruefsummen](https://github.com/d0mm392/Argus/tree/updates)

## Aus dem Quellcode

Electron 33.2.1, Windows x64.

```text
npm ci
npm run test:portal-download
npm start
npx electron-builder --win nsis --x64 --publish never
```

Die Portal-Regression verwendet nur neue Testprofile und kuenstliche In-Memory-Antworten; Testdownloads werden nicht gespeichert oder geoeffnet. 19 gezielte Pruefungen bestehen auch gegen die paketierte Datei. Hotfix-, Pfad- und Portal-Unit-Tests bestehen unter Node 20 und 24; die bekannten Menue-/VM-Symlink-Nachweisluecken sind nicht als behoben ausgegeben.

Anforderungen: [ANFORDERUNGEN.md](ANFORDERUNGEN.md). Lizenz: GPL-3.0-only.
