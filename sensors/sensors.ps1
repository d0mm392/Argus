# Jarvis Messdienst: liest CPU-, GPU- und Mainboard-Sensoren ueber LibreHardwareMonitorLib (mit PawnIO-Treiber)
# und schreibt sie alle 2 Sekunden im Format von LibreHardwareMonitors data.json in eine Datei.
# Laeuft mit Admin-Rechten als geplante Aufgabe "Jarvis Sensoren" und beendet sich, wenn Argus (frueher Jarvis) nicht mehr laeuft.
param([string]$Out)
$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 schreibt Listen sonst als {"value":[...],"Count":n} ins JSON
Remove-TypeData System.Array -ErrorAction SilentlyContinue
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
try {
  Add-Type -TypeDefinition @"
using System; using System.IO; using System.Reflection;
public static class JarvisResolve {
  static string d;
  public static void Init(string dir) {
    d = dir;
    AppDomain.CurrentDomain.AssemblyResolve += (s, e) => { var p = Path.Combine(d, new AssemblyName(e.Name).Name + ".dll"); return File.Exists(p) ? Assembly.LoadFrom(p) : null; };
  }
}
"@
  [JarvisResolve]::Init($dir)
  [void][Reflection.Assembly]::LoadFrom((Join-Path $dir "LibreHardwareMonitorLib.dll"))
  $c = New-Object LibreHardwareMonitor.Hardware.Computer
  $c.IsCpuEnabled = $true; $c.IsGpuEnabled = $true; $c.IsMotherboardEnabled = $true; $c.IsControllerEnabled = $true
  $c.Open()
} catch {
  [IO.File]::WriteAllText("$Out.err", $_.Exception.ToString())
  exit 1
}
$inv = [Globalization.CultureInfo]::InvariantCulture
$units = @{ Temperature = " " + [char]176 + "C"; Clock = " MHz"; Load = " %"; Fan = " RPM"; Control = " %" }
function Img($hw) {
  switch -regex ($hw.HardwareType.ToString()) { "^Cpu" { "cpu.png" } "^Gpu" { "gpu.png" } "Motherboard" { "mainboard.png" } "SuperIO|EmbeddedController" { "chip.png" } "Cooler|FanController" { "fan.png" } default { "other.png" } }
}
function Node($hw) {
  try { $hw.Update() } catch {}
  $kids = @()
  foreach ($sub in $hw.SubHardware) { $kids += , (Node $sub) }
  foreach ($s in $hw.Sensors) {
    $t = $s.SensorType.ToString()
    if (-not $units.ContainsKey($t) -or $s.Value -eq $null) { continue }
    $kids += , @{ Text = $s.Name; Type = $t; Value = ([double]$s.Value).ToString("0.0", $inv) + $units[$t]; Children = @() }
  }
  return @{ Text = $hw.Name; ImageURL = "images_icon/" + (Img $hw); Children = $kids }
}
# Alienware: Mainboard meldet keine Luefter, die Drehzahl gibt nur die eigene WMI-Schnittstelle (wie Alienware Command Center) heraus.
# Nur lesend: Thermal_Information mit Befehl 5 = Drehzahl in U/min, Luefter-Kennungen ab 0x32 (bei Domi 0x32 und 0x33).
$awcc = $null; $awFans = @()
function AwTI($a) { [uint32](Invoke-CimMethod -InputObject $awcc -MethodName Thermal_Information -Arguments @{ arg2 = [uint32]$a } -ErrorAction Stop).argr }
try {
  $awcc = Get-CimInstance -Namespace root/WMI -ClassName AWCCWmiMethodFunction -ErrorAction Stop | Select-Object -First 1
  foreach ($id in 0x32..0x39) { try { $r = AwTI (5 -bor ($id -shl 8)); if ($r -lt [uint32]4294901760) { $awFans += $id } } catch {} }
} catch { $awcc = $null }
$ue = [string][char]252
function AwNode() {
  $kids = @(); $n = 0
  foreach ($id in $awFans) {
    $n++
    try { $r = AwTI (5 -bor ($id -shl 8)); if ($r -lt 100000) { $kids += , @{ Text = "L" + $ue + "fter " + $n; Type = "Fan"; Value = ([double]$r).ToString("0.0", $inv) + " RPM"; Children = @() } } } catch {}
  }
  return @{ Text = "Alienware L" + $ue + "fter"; ImageURL = "images_icon/fan.png"; Children = $kids }
}

$idle = 0
while ($true) {
  try {
    $hws = @(); foreach ($h in $c.Hardware) { $hws += , (Node $h) }
    if ($awFans.Count) { $hws += , (AwNode) }
    $json = ConvertTo-Json @{ Text = "Jarvis"; Children = $hws } -Depth 10 -Compress
    [IO.File]::WriteAllText("$Out.tmp", $json, (New-Object Text.UTF8Encoding $false))
    Move-Item -Force "$Out.tmp" $Out
  } catch { [IO.File]::WriteAllText("$Out.err", $_.Exception.ToString()) }
  if (Get-Process -Name Argus, Jarvis -ErrorAction SilentlyContinue) { $idle = 0 } else { $idle++ }
  if ($idle -gt 15) { break }
  Start-Sleep -Seconds 2
}
$c.Close()
