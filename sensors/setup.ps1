# Einmalige Einrichtung mit Admin-Rechten: PawnIO-Treiber installieren, Messdienst nach %LOCALAPPDATA%\Jarvis-Sensoren kopieren
# und als geplante Aufgabe "Jarvis Sensoren" (hoechste Rechte, ohne weitere Nachfrage) eintragen.
param([string]$Out)
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = "$Out.setup.log"
try {
  # Aus dem Internet geladen? Markierung entfernen, sonst laedt .NET die Bibliotheken nicht
  Get-ChildItem -Path $src -File | Unblock-File -ErrorAction SilentlyContinue
  # Vorab pruefen statt mitten in der Einrichtung mit "Datei nicht gefunden" abzubrechen
  $miss = @("sensors.ps1", "version.txt", "PawnIO_setup.exe", "LibreHardwareMonitorLib.dll") | Where-Object { -not (Test-Path (Join-Path $src $_)) }
  if ($miss) { throw "Sensor-Dateien fehlen im Argus-Ordner ($($miss -join ', ')). Bitte Argus neu installieren oder auf eine neuere Version aktualisieren." }
  # Pruefsummen aus SHA256SUMS.txt: nur unveraenderte Dateien aus dem offiziellen Release verwenden
  $sumFile = Join-Path $src "SHA256SUMS.txt"
  if (Test-Path $sumFile) {
    foreach ($line in Get-Content $sumFile) {
      if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+)$') { continue }
      $f = Join-Path $src $Matches[2].Trim()
      if (-not (Test-Path $f)) { throw "Sensor-Datei fehlt: $($Matches[2].Trim()). Bitte Argus neu installieren." }
      if ((Get-FileHash -Algorithm SHA256 -Path $f).Hash -ne $Matches[1].ToUpper()) { throw "Sensor-Datei veraendert oder beschaedigt: $($Matches[2].Trim()). Bitte Argus neu installieren." }
    }
  }
  if (-not (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO")) {
    # Treiber nur starten, wenn die Datei signiert, unveraendert und von namazso ist. Pruefsumme oben ist der eigentliche Schutz;
    # "UnknownError" (Stammzertifikat offline noch nicht geladen) blockiert nicht, Windows prueft den Treiber beim Laden ohnehin selbst.
    $pawn = Join-Path $src "PawnIO_setup.exe"
    $sig = Get-AuthenticodeSignature -FilePath $pawn
    if ((@("NotSigned", "HashMismatch", "NotTrusted") -contains [string]$sig.Status) -or ($sig.SignerCertificate.Subject -notmatch "namazso")) { throw "PawnIO_setup.exe ist nicht von namazso signiert oder veraendert ($($sig.Status)), Treiber wird nicht installiert" }
    $p = Start-Process -FilePath $pawn -ArgumentList "-install", "-silent" -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "PawnIO-Treiber liess sich nicht installieren (Code $($p.ExitCode))" }
  }
  $dst = Join-Path $env:LOCALAPPDATA "Jarvis-Sensoren"
  try { Stop-ScheduledTask -TaskName "Jarvis Sensoren" -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Milliseconds 500
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Copy-Item -Force -Path (Join-Path $src "*") -Destination $dst -Exclude "PawnIO_setup.exe", "setup.ps1", "SHA256SUMS.txt"
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
