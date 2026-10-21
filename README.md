# Argus (Quellcode)

Desktop-Widget für Windows (Linux-AppImage ab 0.35): animierte Neuronen-Kugel als Statusanzeige und KI-Assistent, mit System-Sensoren, Bitcoin-Mining-Überwachung (OCEAN, Foreman, mempool.space), Gaming-Seite, Steam-/Discord-Freundeslisten und frei anordenbaren Fenstern. Gebaut in JavaScript auf Electron 33; die Oberfläche ist eine einzelne `app/index.html` ohne Framework. Sensoren laufen über PowerShell.

Version 0.37.0 · Lizenz: GPL-3.0 (siehe `LICENSE`) · Fertige Installer: Zweige `stable` und `updates`.

## Bauen

```
npm install
npx electron .                                  # starten
npx electron-builder --win nsis --x64           # Installer
```

## Hinweise

- Zugangsdaten (Foreman, Wallets, KI-Schlüssel, Steam-Key, Discord-Bot) stehen **nicht** im Code. Sie liegen nur lokal im Datenordner (`%APPDATA%\argus-desktop`) und werden mit Electron safeStorage verschlüsselt.
- Nicht enthalten: die Sensor-Bibliotheken (LibreHardwareMonitor, MPL-2.0) und der PawnIO-Treiber (`sensors/LIZENZEN.txt`). Sie werden vom Einrichtungsskript `sensors/setup.ps1` geholt.
- Auto-Update liest standardmäßig die Zweige dieses Repos. Für einen eigenen Fork die Update-Adresse in den Einstellungen ändern.
- Vieles ist unter Linux (virtueller Bildschirm) getestet, nicht auf jeder Windows-Hardware. Fehler bitte als Issue melden, ohne Schlüssel oder Wallet-Adressen.
