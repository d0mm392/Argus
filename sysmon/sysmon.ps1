# Argus Systemmonitor: EIN dauerhaft laufender PowerShell-Prozess statt alle paar Sekunden neue Aufrufe.
# Jeder neue PowerShell-Start kostet spuerbar CPU und liess Argus ab und zu ruckeln.
# Schreibt alle 3 Sekunden eine JSON-Zeile: Prozesse (CPU-Sekunden, RAM), Programme mit Fenster, Netzwerk-Bytes.
param([string]$Tray = "", [int]$Parent = 0)
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
# Windows PowerShell 5.1 schreibt Listen sonst als {"value":[...],"Count":n} ins JSON
Remove-TypeData System.Array -ErrorAction SilentlyContinue
$NI = [System.Net.NetworkInformation.NetworkInterface]
# Vollbild-Erkennung fuer den Spielmodus: Vordergrundfenster deckt seinen ganzen Bildschirm ab (Desktop selbst zaehlt nicht)
$fsOk = $false
try {
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class JFs {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public R m; public R w; public uint f; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MI i);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static uint Pid() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || h == GetShellWindow() || h == GetDesktopWindow()) return 0;
    StringBuilder sb = new StringBuilder(64); GetClassName(h, sb, 64); string c = sb.ToString();
    if (c == "WorkerW" || c == "Progman") return 0;
    R r; if (!GetWindowRect(h, out r)) return 0;
    MI mi = new MI(); mi.cb = Marshal.SizeOf(typeof(MI));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return 0;
    if (r.L <= mi.m.L && r.T <= mi.m.T && r.Rt >= mi.m.Rt && r.B >= mi.m.B) { uint p; GetWindowThreadProcessId(h, out p); return p; }
    return 0;
  }
}
"@
$fsOk = $true
} catch {}
$n = 0
while ($true) {
  $n++
  $ps = Get-Process
  $procs = foreach ($p in $ps) { $c = 0; try { $c = $p.TotalProcessorTime.TotalSeconds } catch {}; , @($p.ProcessName, [math]::Round($c, 2), $p.WorkingSet64) } # Komma: jede Zeile bleibt ein eigenes Feld
  $o = @{ t = [DateTimeOffset]::Now.ToUnixTimeMilliseconds(); procs = @($procs) }
  # Programme mit Fenster (und bekannte Tray-Programme) nur jede zweite Runde, das braucht Pfad und Beschreibung
  if ($n % 2 -eq 1) {
    $o.apps = @($ps | Where-Object { $_.MainWindowHandle -ne 0 -or ($Tray -and $_.ProcessName -match "^($Tray)$") } | ForEach-Object {
      $path = $null; $desc = $null; try { $path = $_.Path; $desc = $_.Description } catch {}
      if ($path) { @{ n = $_.ProcessName; p = $path; d = $desc; w = ($_.MainWindowHandle -ne 0) } } })
  }
  # Netzwerk: die aktive Verbindung mit den meisten Bytes
  $best = $null
  foreach ($i in $NI::GetAllNetworkInterfaces()) {
    if ($i.NetworkInterfaceType -eq "Loopback" -or $i.NetworkInterfaceType -eq "Tunnel") { continue }
    try { $s = $i.GetIPStatistics() } catch { continue }
    $tot = $s.BytesReceived + $s.BytesSent
    if ($i.OperationalStatus -eq "Up" -and (-not $best -or $tot -gt $best.tot)) { $best = @{ name = $i.Name; rx = $s.BytesReceived; tx = $s.BytesSent; tot = $tot; up = $true } }
  }
  if ($fsOk) { $o.fs = ""; try { $fp = [JFs]::Pid(); if ($fp) { $fpr = Get-Process -Id $fp -ErrorAction SilentlyContinue; if ($fpr) { $o.fs = $fpr.ProcessName } } } catch {} }
  if ($best) { $o.net = $best } else { $o.net = @{ name = ""; up = $false; rx = 0; tx = 0 } }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush()
  if ($Parent -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { break } # Argus beendet
  Start-Sleep -Seconds 4
}
