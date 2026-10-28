# Argus 0.58.21 (Testkanal)

Quellcode des Sicherheits-Hotfixes fuer den Testkanal `updates`. Der stabile Kanal bleibt unveraendert.

[Versionshinweise und bekannte Einschraenkungen](RELEASE-NOTES-0.58.21.md) ? [Windows-Download und Pruefsummen](https://github.com/d0mm392/Argus/tree/updates)

Die allgemeine Menue-UI-Suite ist nicht vollstaendig bestanden. Symbolische Links sind unter Windows auf dem Host, aber mangels Rechten nicht in der Test-VM nachgewiesen. Einzelheiten stehen in den Versionshinweisen.

## Aus dem Quellcode

Electron 33.2.1, Windows x64.

```text
npm ci
npm start
npx electron-builder --win nsis --x64 --publish never
```

Der Lockfile-Kopf traegt unveraendert eine aeltere Projektversion; die Abhaengigkeiten entsprechen dem geprueften Build. Die Anwendungsversion in package.json und im Installer ist 0.58.21.

Anforderungen: [ANFORDERUNGEN.md](ANFORDERUNGEN.md). Quellcode-Lizenz: GPL-3.0-only.
