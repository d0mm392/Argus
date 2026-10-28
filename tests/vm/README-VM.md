# VM-Tests für den Hotfix 0.58.20: Einrichtung und Ablauf

Die Tests U1–U9 (Electron) und I1–I7 (Bau, Installation, Update) laufen **nur in einer wegwerfbaren Windows-11-VM** mit Testdaten. Auf dem Arbeitsrechner selbst wird nichts davon ausgeführt.

## 1. Einmalig auf dem PC (Windows 11 Home)

**Empfohlen:** **VMware Workstation Pro** (für private Nutzung kostenlos, Download über ein Broadcom-Konto). Es läuft auch, wenn der Windows-Hypervisor aktiv ist, wie auf diesem PC.

**Alternative ohne Konto:** **Oracle VirtualBox 7.x**. Wenn der Windows-Hypervisor aktiv ist, läuft es langsamer über die „Windows-Hypervisor-Plattform“.

**Betriebssystem der VM:** **Windows 11 Enterprise Evaluation** als ISO (90 Tage, kostenlos, Microsoft Evaluation Center).

Mehr wird auf dem PC nicht installiert. Argus und das produktive Repository bleiben unberührt.

**Nicht verfügbar auf Windows 11 Home:** Hyper-V-Manager und Windows-Sandbox gibt es erst ab Windows 11 Pro (kostenpflichtiges Upgrade). Mit Pro wäre die Windows-Sandbox die einfachste Lösung (eingebaut, wegwerfbar, Netz per `.wsb`-Datei abschaltbar). Wegen des Upgrades ist sie aber nicht die erste Wahl.

## 2. VM anlegen

- **Ressourcen:** 4 CPU-Kerne, 8 GB RAM, 80 GB Festplatte. TPM 2.0 und Secure Boot einschalten (bei VMware heißt das „Encrypt VM“ und „Add TPM“).
- **Windows-Installation:** mit einem lokalen Admin-Konto `vmadmin`. Dazu ein **Standardkonto `argustest`** ohne Adminrechte für die Testläufe.
- **Keine Daten vom PC:** Keine geteilten Ordner auf Dauer, keine gemeinsame Zwischenablage, kein Microsoft-Konto, keine Daten vom Projektinhaber.

## 3. Bau-Phase (VM mit Netz, als `vmadmin`)

1. **Werkzeuge:** Git und Node.js 20 LTS in der VM installieren.
2. **Arbeitsstand übertragen:**
   - einmalig einen geteilten Ordner **nur lesend** einrichten;
   - den zu prüfenden Arbeitsstand (z. B. per `git archive` des Commits) nach `C:\VMTest\argus-hotfix` kopieren;
   - den geteilten Ordner danach **entfernen**.
3. **Bauen:**
   - `cd C:\VMTest\argus-hotfix`
   - `git log -1` muss `c1f501c` (oder den freigegebenen Stand) zeigen.
   - `npm ci`
   - `npx electron-builder --win nsis --x64 --publish never`
4. **Manifest erstellen:** `powershell -File tests\vm\install-checks.ps1 -Step Manifest -Dir dist\win-unpacked -Out C:\VMTest\manifest.json`
5. **Für I4 (Update von 0.58.19):** ein `Argus-Setup-0.58.19.exe` bereitlegen. Entweder aus dem veröffentlichten Kanal oder in der VM aus Commit `afe5cd7` gleich gebaut.
6. **Optional für I7:** Sysmon installieren, mit Protokollierung von Prozessstarts, Netzverbindungen und DNS.
7. **Abschluss der Bau-Phase:** **Netzwerkadapter der VM trennen**, dann einen Snapshot **„Test-Basis“** anlegen.

## 4. Test-Phase (VM ohne Netz, als `argustest`)

1. **Vorprüfung:** `powershell -File C:\VMTest\argus-hotfix\tests\vm\vm-preflight.ps1`. Sie muss „VORPRÜFUNG BESTANDEN“ melden.
2. **Electron- und Node-Tests:** `powershell -File C:\VMTest\argus-hotfix\tests\vm\run-vm-tests.ps1`. Das führt aus:
   - die Node-Tests unter der Node-Laufzeit von Electron 33;
   - U1–U6, U8, U9 in einem Electron-Prozess;
   - U7 in drei getrennten Prozessen.
   
   Die Ergebnisse stehen in `C:\VMTest\ergebnisse`.
3. **Installation und Update**, jeweils aus dem Snapshot „Test-Basis“:
   - **I2/I3 (Erstinstallation):**
     - `install-checks.ps1 -Step Install -Setup <Argus-Setup-0.58.20.exe>`
     - dann `-Step Compare -Manifest C:\VMTest\manifest.json`
     - Zusätzliche Dateien, die der Installer anlegt, z. B. `Uninstall Argus.exe`, nur nach Nachweis mit `-Allow` zulassen.
   - **I4 (Update):**
     - `-Step Install -Setup <Argus-Setup-0.58.19.exe>`
     - dann `-Step Fixture`
     - dann `-Step Install -Setup <Argus-Setup-0.58.20.exe>`
     - dann `-Step Compare`
     - Danach dreimal Argus starten und beenden (I5) und die Hashes der Fixture-Dateien mit `%TEMP%\fixture-hashes.txt` vergleichen.
   - **I6:** in einer Kopie des Snapshots `resources\app\main.js` beschädigen. Argus muss sich mit einem Eintrag in `argus-error.log` beenden, ohne Neustart.
4. **Ergebnisse sichern:** `C:\VMTest\ergebnisse` aus der VM kopieren. Dann den Snapshot verwerfen.

## 5. Bewertung

- **Bestanden** ist nur, was mit Exit-Code 0 **und** einer vollständigen Ergebnisdatei endet.
- **Nicht ausgeführt** zählt immer als **nicht bestanden**.
- **Freigabefehler** sind ein Fund von Cloud-KI-Zugriffen sowie unerwartete Prozesse oder Netzversuche.
