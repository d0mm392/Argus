# Argus unter Linux

Argus gibt es für Linux als **AppImage** (eine Datei, keine Installation). Stand: erste Fassung ab Version 0.35, nur auf einem virtuellen Bildschirm getestet. Rückmeldungen sind willkommen.

## Voraussetzungen

- 64-Bit-Linux mit grafischem Desktop (X11 oder Wayland mit XWayland), z. B. Ubuntu, Mint, Fedora, Arch.
- Ein Desktop mit **Compositing**, sonst ist das durchsichtige Fenster schwarz. GNOME, KDE und Cinnamon haben das standardmäßig.
- FUSE 2 für AppImages. Ubuntu 22.04 und neuer: `sudo apt install libfuse2` (ab 24.04: `libfuse2t64`). Alternative ohne FUSE siehe unten.

## Installieren

1. Die Datei `Argus-x.y.z.AppImage` bekommst du von Domi. Sie ist über 100 MB groß und liegt deshalb nicht in diesem Repo.
2. Ausführbar machen und starten:
   ```bash
   chmod +x Argus-*.AppImage
   ./Argus-*.AppImage
   ```
   Alternativ im Dateimanager: Rechtsklick → Eigenschaften → Rechte → „Als Programm ausführen“.
3. Beim ersten Start fragt Argus nach Namen, KI und gewünschten Anzeigen (wie unter Windows).

Tipp: Lege die Datei in einen festen Ordner, z. B. `~/Programme/`, bevor du den Autostart einschaltest.

## Ohne FUSE starten

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./Argus-*.AppImage
```

## Autostart

In Argus unter Einstellungen → System „Mit Windows starten“ einschalten (der Name stammt noch von Windows, gemeint ist der Start beim Anmelden). Argus legt dann `~/.config/autostart/argus.desktop` an. Ausschalten entfernt die Datei wieder.

## Was anders ist als unter Windows

- **Kein automatisches Update.** Neue Versionen bekommst du als neue AppImage-Datei, die alte einfach ersetzen. Deine Einstellungen bleiben (`~/.config/argus-desktop/`).
- **Windows-only-Funktionen sind ausgeblendet:** der Temperatur-Messdienst (LibreHardwareMonitor/PawnIO) und Alienware-Lüfter. Temperaturen und Auslastung kommen aus dem System (`systeminformation`, bei NVIDIA zusätzlich `nvidia-smi`).
- **Fenster-Spiegel** und **Aussparung** (freie Ecke) hängen vom Desktop ab. Unter Wayland kann die Bildschirmfreigabe eine Abfrage zeigen.
- Die KI läuft wie unter Windows über Claude Code (mit deinem eigenen Konto) oder lokal.

## Probleme

| Symptom | Lösung |
|---|---|
| `dlopen(): error loading libfuse.so.2` | `libfuse2` installieren oder ohne FUSE starten (s. o.) |
| Fenster ist schwarz oder nicht durchsichtig | Compositing am Desktop einschalten; als Test `./Argus-*.AppImage --disable-gpu` |
| Startet nicht, Meldung zu „sandbox“ | Argus startet AppImages bereits mit `--no-sandbox`; sonst Datei erneut herunterladen |
| Kein Ton / keine Spracheingabe | Mikrofon in den Systemeinstellungen freigeben (PipeWire/PulseAudio) |

Fehler bitte mit Distribution, Desktop (GNOME/KDE …) und X11/Wayland an Domi melden. Keine Passwörter oder Schlüssel mitschicken.
