# Installations- und Update-Szenarien (I2-I6) in der Test-VM. Jedes Szenario aus frischem Snapshot "Test-Basis" ausführen.
#   A  Erstinstallation 0.58.20: I2 (kein Autostart), I3 (Baum = Manifest), I5 (drei Starts ohne Neustart/Änderung)
#   B  Update 0.58.19 -> 0.58.20 mit präparierter Altinstallation: I4 (Altbestand entfernt, Profil unberührt), I5
#   R  Referenz: 0.58.19 mit derselben Präparation einmal starten (zeigt, dass die Präparation den alten Rollback auslöst)
#   C  I6: beschädigte main.js -> Abbruch mit argus-error.log, kein Neustart
param([Parameter(Mandatory)][ValidateSet('A', 'B', 'R', 'C')][string]$Scenario)
$ErrorActionPreference = 'Continue'
$chk = Join-Path $PSScriptRoot 'install-checks.ps1'
$new = 'C:\VMTest\argus-hotfix\dist\Argus-Setup-0.58.20.exe'; $old = 'C:\VMTest\argus-0.58.19\dist\Argus-Setup-0.58.19.exe'; $man = 'C:\VMTest\manifest.json'
$ud = Join-Path $env:APPDATA 'argus-desktop'
$script:fails = 0
function Check($id, $ok, $info) { if ($ok) { "PASS $id" } else { $script:fails++; "FAIL $id  -> $info" } }
function Step([string[]]$a) { $o = & powershell -NoProfile -ExecutionPolicy Bypass -File $chk @a 2>&1 | ForEach-Object { "$_" }; $code = $LASTEXITCODE; $o | ForEach-Object { Write-Host "  | $_" }; return $code }
function InstallDir { $k = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like 'Argus*' } | Select-Object -First 1; if ($k) { (Get-ItemProperty "HKCU:\Software\$($k.PSChildName)").InstallLocation.TrimEnd('\') } }
# Startet Argus.exe, beobachtet Hauptprozesse (Eltern nicht Argus) und beendet ihn nach $Sec Sekunden
function RunArgus([int]$Sec = 45) {
    $exe = Join-Path (InstallDir) 'Argus.exe'; $p = Start-Process $exe -PassThru; $roots = @{}; $alive = $false
    for ($i = 0; $i -lt $Sec / 3; $i++) {
        Start-Sleep 3
        $ps = Get-CimInstance Win32_Process -Filter "Name='Argus.exe'"; $ids = @($ps | ForEach-Object ProcessId)
        foreach ($x in $ps) { if ($ids -notcontains $x.ParentProcessId) { $roots[$x.ProcessId] = $true } }
        $alive = $ps.Count -gt 0
    }
    Get-Process Argus -ErrorAction Ignore | Stop-Process -Force; Start-Sleep 3
    [pscustomobject]@{ Roots = $roots.Count; AliveAtEnd = $alive; FirstExited = $p.HasExited; ExitCode = $(if ($p.HasExited) { $p.ExitCode } else { $null }) }
}
function FixtureUnchanged { $bad = @(); foreach ($l in Get-Content (Join-Path $env:TEMP 'fixture-hashes.txt')) { $h, $rel = $l -split '  ', 2; $f = Join-Path $ud $rel; if (-not (Test-Path -LiteralPath $f)) { $bad += "fehlt $rel" } elseif ((Get-FileHash -LiteralPath $f).Hash -ne $h) { $bad += "geändert $rel" } }; $bad }
$allow = @('-Allow', 'Uninstall Argus.exe')

"SZENARIO $Scenario  $(Get-Date -Format s)"
switch ($Scenario) {
    'A' {
        Check 'I2 stille Installation ohne Erststart' ((Step @('-Step', 'Install', '-Setup', $new)) -eq 0) 'siehe oben'
        Check 'I3 Laufzeitbaum = Manifest' ((Step (@('-Step', 'Compare', '-Manifest', $man) + $allow)) -eq 0) 'siehe oben'
        foreach ($i in 1..3) { $r = RunArgus; Check "I5 Start $i läuft, kein Neustart" ($r.Roots -eq 1 -and $r.AliveAtEnd) ($r | ConvertTo-Json -Compress) }
        Check 'I5 kein argus-error.log' (-not (Test-Path "$ud\argus-error.log")) (Get-Content "$ud\argus-error.log" -Raw -ErrorAction Ignore)
        Check 'I5 Laufzeitbaum nach Starts unverändert' ((Step (@('-Step', 'Compare', '-Manifest', $man) + $allow)) -eq 0) 'siehe oben'
    }
    'B' {
        Check 'I4 Vorbereitung: 0.58.19 installiert' ((Step @('-Step', 'Install', '-Setup', $old)) -eq 0) 'siehe oben'
        $null = Step @('-Step', 'Fixture')
        $root = InstallDir
        Check 'I4 Update auf 0.58.20 installiert' ((Step @('-Step', 'Install', '-Setup', $new)) -eq 0) 'siehe oben'
        Check 'I4 Altbestand entfernt, Baum = Manifest' ((Step (@('-Step', 'Compare', '-Manifest', $man) + $allow)) -eq 0) 'siehe oben'
        Check 'I4 Installationsordner gleich geblieben' ((InstallDir) -eq $root) "$root -> $(InstallDir)"
        $b = FixtureUnchanged; Check 'I4 Profil (Marker, Sicherung, Stage, Archiv) unverändert nach Update' ($b.Count -eq 0) ($b -join '; ')
        foreach ($i in 1..3) { $r = RunArgus; Check "I5 Start $i nach Update läuft, kein Neustart" ($r.Roots -eq 1 -and $r.AliveAtEnd) ($r | ConvertTo-Json -Compress) }
        $b = FixtureUnchanged; Check 'I5 Profil nach drei Starts unverändert' ($b.Count -eq 0) ($b -join '; ')
        Check 'I5 kein Rollback in den Programmordner' ((Step (@('-Step', 'Compare', '-Manifest', $man) + $allow)) -eq 0) 'siehe oben'
        Check 'I5 kein argus-error.log' (-not (Test-Path "$ud\argus-error.log")) (Get-Content "$ud\argus-error.log" -Raw -ErrorAction Ignore)
    }
    'R' {
        $null = Step @('-Step', 'Install', '-Setup', $old); $null = Step @('-Step', 'Fixture')
        $main = Join-Path (InstallDir) 'resources\app\main.js'; $before = (Get-FileHash $main).Hash
        $r = RunArgus 60
        $changed = (-not (Test-Path $main)) -or ((Get-FileHash $main).Hash -ne $before) -or ((Get-Content $main -Raw) -match 'SENTINEL-ALT')
        $b = FixtureUnchanged
        "  Referenz 0.58.19: Hauptprozesse $($r.Roots), main.js verändert: $changed, Profiländerungen: $($b -join '; ')"
        Check 'REF Präparation wirkt auf 0.58.19 (Rollback oder Markerverbrauch beobachtet)' ($changed -or $r.Roots -gt 1 -or $b.Count -gt 0) 'keine Wirkung - Präparation ungeeignet'
    }
    'C' {
        $null = Step @('-Step', 'Install', '-Setup', $new)
        $main = Join-Path (InstallDir) 'resources\app\main.js'; Add-Content $main "`n)( SYNTAXFEHLER-I6"
        $r = RunArgus 30
        Check 'I6 Argus beendet sich' (-not $r.AliveAtEnd -and $r.FirstExited) ($r | ConvertTo-Json -Compress)
        Check 'I6 kein Neustart' ($r.Roots -le 1) ($r | ConvertTo-Json -Compress)
        $log = Get-Content "$ud\argus-error.log" -Raw -ErrorAction Ignore
        Check 'I6 argus-error.log mit Startfehler' ($log -match 'Start fehlgeschlagen') "$log"
        Check 'I6 main.js nicht aus Sicherung ersetzt' ((Get-Content $main -Raw) -match 'SYNTAXFEHLER-I6') 'main.js wurde verändert'
    }
}
if ($Error.Count) { $script:fails++; "FAIL Skriptfehler: $($Error.Count)"; $Error | ForEach-Object { "  ! $($_.InvocationInfo.ScriptLineNumber): $_" } }
"SZENARIO $Scenario ENDE: Fehler $script:fails"
exit $(if ($script:fails) { 1 } else { 0 })
