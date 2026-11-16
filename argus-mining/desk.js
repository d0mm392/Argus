// Desktop-Teil (nur Windows): eigenes Programmfenster statt Browser-Tab und ein Symbol neben der Uhr.
// Fenster: Microsoft Edge (auf jedem Windows 10/11 vorhanden) im App-Modus mit eigenem Profil, also ohne Adressleiste und Tabs,
// mit eigenem Eintrag in der Taskleiste. Schließen des Fensters beendet die Überwachung NICHT; beendet wird nur über das Symbol → Beenden.
// Symbol neben der Uhr: kleines PowerShell-Skript (System.Windows.Forms.NotifyIcon), das mit dem Programm endet.
const fs = require("fs"), path = require("path"), { spawn, exec } = require("child_process");
let dir = "", port = 8420, log = () => {}, tray = null;
function edge() {
  const c = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map((b) => path.join(b, "Microsoft", "Edge", "Application", "msedge.exe"));
  return c.find((f) => { try { return fs.existsSync(f); } catch { return false; } }) || "";
}
function openWindow(sub = "") {
  if (process.platform !== "win32") return false;
  const url = `http://localhost:${port}/${sub}`, e = edge();
  if (e) {
    try { const c = spawn(e, [`--app=${url}`, `--user-data-dir=${path.join(dir, "fenster")}`, "--window-size=1500,950", "--no-first-run", "--disable-features=Translate"], { detached: true, stdio: "ignore" }); c.on("error", () => exec(`start "" "${url}"`)); c.unref(); return true; } catch {}
  }
  exec(`start "" "${url}"`); return true; // ohne Edge: Standardbrowser
}
// Symbol neben der Uhr. Klick = Fenster öffnen, Menü: Öffnen, Protokoll, Beenden. Spricht nur mit diesem Programm auf localhost.
function startTray(exePath, version) {
  if (process.platform !== "win32" || tray) return;
  const ps = path.join(dir, "symbol.ps1"), ico = path.join(path.dirname(exePath), "Argus-Mining.ico");
  const src = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$parent = ${process.pid}
$base = 'http://localhost:${port}'
function Send($p) { try { Invoke-WebRequest -UseBasicParsing -Method POST -Uri ($base + $p) -TimeoutSec 5 | Out-Null } catch {} }
$n = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path '${ico.replace(/'/g, "''")}') { $n.Icon = New-Object System.Drawing.Icon('${ico.replace(/'/g, "''")}') } else { $n.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${exePath.replace(/'/g, "''")}') }
$n.Text = 'Argus Mining ${version} – überwacht die Miner'
$m = New-Object System.Windows.Forms.ContextMenuStrip
$o = $m.Items.Add('Argus Mining öffnen'); $o.Font = New-Object System.Drawing.Font($o.Font, [System.Drawing.FontStyle]::Bold)
$o.add_Click({ Send '/api/app/open' })
$l = $m.Items.Add('Protokoll öffnen'); $l.add_Click({ Send '/api/app/open?tab=log' })
$m.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$q = $m.Items.Add('Beenden (Überwachung stoppt)')
$q.add_Click({ $r = [System.Windows.Forms.MessageBox]::Show('Argus Mining beenden? Dann werden die Miner nicht mehr überwacht und es entstehen Lücken im Report.', 'Argus Mining', 'YesNo', 'Warning'); if ($r -eq 'Yes') { Send '/api/app/quit'; $n.Visible = $false; [System.Windows.Forms.Application]::Exit() } })
$n.ContextMenuStrip = $m
$n.add_MouseClick({ if ($_.Button -eq 'Left') { Send '/api/app/open' } })
$n.Visible = $true
$n.ShowBalloonTip(4000, 'Argus Mining läuft', 'Überwacht die Miner im Hintergrund. Fenster schließen beendet nichts.', 'Info')
$t = New-Object System.Windows.Forms.Timer; $t.Interval = 3000
$t.add_Tick({ if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { $n.Visible = $false; [System.Windows.Forms.Application]::Exit() } })
$t.Start()
[System.Windows.Forms.Application]::Run()
$n.Dispose()
`;
  try { fs.writeFileSync(ps, "﻿" + src); } catch (e) { log("Symbol neben der Uhr nicht möglich: " + e.message); return; }
  const run = () => {
    try {
      tray = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-STA", "-File", ps], { windowsHide: true, stdio: "ignore" });
      tray.on("exit", () => { tray = null; }); // wird es beendet (z. B. Explorer neu gestartet), startet die nächste Prüfung es neu
      tray.on("error", (e) => { tray = null; if (++fails === 1) log("Symbol neben der Uhr nicht möglich: " + e.message); });
    } catch (e) { log("Symbol neben der Uhr nicht möglich: " + e.message); }
  };
  let fails = 0;
  run(); setInterval(() => { if (!tray && fails < 5) run(); }, 60e3).unref?.();
}
function init(d, p, logFn) { dir = d; port = p; log = logFn; }
const stopTray = () => { try { tray?.kill(); } catch {} };
module.exports = { init, openWindow, startTray, stopTray, edge };
