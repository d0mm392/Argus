# Einmalige Einrichtung mit Admin-Rechten: PawnIO-Treiber installieren, Messdienst nach %LOCALAPPDATA%\Jarvis-Sensoren kopieren
# und als geplante Aufgabe "Jarvis Sensoren" (hoechste Rechte, ohne weitere Nachfrage) eintragen.
param([string]$Out)
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = "$Out.setup.log"
try {
  # Aus dem Internet geladen? Markierung entfernen, sonst laedt .NET die Bibliotheken nicht
  Get-ChildItem -Path $src -File | Unblock-File -ErrorAction SilentlyContinue
  if (-not (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO")) {
    $p = Start-Process -FilePath (Join-Path $src "PawnIO_setup.exe") -ArgumentList "-install", "-silent" -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "PawnIO-Treiber liess sich nicht installieren (Code $($p.ExitCode))" }
  }
  $dst = Join-Path $env:LOCALAPPDATA "Jarvis-Sensoren"
  try { Stop-ScheduledTask -TaskName "Jarvis Sensoren" -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Milliseconds 500
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Copy-Item -Force -Path (Join-Path $src "*") -Destination $dst -Exclude "PawnIO_setup.exe", "setup.ps1"
  Get-ChildItem -Path $dst -File | Unblock-File -ErrorAction SilentlyContinue
  $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arg = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $dst 'sensors.ps1')`" -Out `"$Out`""
  $act = New-ScheduledTaskAction -Execute $ps -Argument $arg
  $usr = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $pr = New-ScheduledTaskPrincipal -UserId $usr -LogonType Interactive -RunLevel Highest
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -Hidden
  $trg = New-ScheduledTaskTrigger -AtLogOn -User $usr
  Register-ScheduledTask -TaskName "Jarvis Sensoren" -Action $act -Trigger $trg -Principal $pr -Settings $set -Force | Out-Null
  Start-ScheduledTask -TaskName "Jarvis Sensoren"
  "ok" | Set-Content -Path $log
} catch {
  ("fehler: " + $_.Exception.Message) | Set-Content -Path $log
}
