# Installations- und Updateprüfung I1-I7 (Plan 4.3). NUR in der Test-VM bzw. (Schritt Manifest) in der Bau-VM.
# Schritte einzeln aufrufen:
#   Manifest  -Dir <dist\win-unpacked> -Out manifest.json            (Bau-VM, nach electron-builder)
#   Install   -Setup <Argus-Setup-x.exe>                             (Test-VM: stille Installation, überwacht Erststart)
#   Compare   -Manifest manifest.json [-Allow 'Uninstall Argus.exe'] (Test-VM: Laufzeitbaum gegen Manifest)
#   Fixture                                                          (Test-VM: präparierte Altinstallation I4)
param([Parameter(Mandatory)][ValidateSet('Manifest', 'Install', 'Compare', 'Fixture')][string]$Step,
      [string]$Dir, [string]$Out, [string]$Setup, [string]$Manifest, [string[]]$Allow = @())
$ErrorActionPreference = 'Stop'
function Get-Tree($root) { Get-ChildItem -LiteralPath $root -Recurse -File -Force | ForEach-Object { [pscustomobject]@{ p = $_.FullName.Substring($root.Length + 1); n = $_.Length; h = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } } }
function Get-InstallDir {
    # electron-builder legt InstallLocation unter HKCU\Software\<GUID> ab, nicht im Uninstall-Schlüssel
    $k = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like 'Argus*' } | Select-Object -First 1
    if (-not $k) { throw 'Argus nicht in der Registry gefunden (I3)' }
    $loc = (Get-ItemProperty "HKCU:\Software\$($k.PSChildName)" -ErrorAction SilentlyContinue).InstallLocation
    if (-not $loc) { throw 'InstallLocation nicht in der Registry gefunden (I3)' }
    return $loc.TrimEnd('\')
}
switch ($Step) {
    'Manifest' { Get-Tree (Resolve-Path $Dir).Path | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $Out -Encoding UTF8; "Manifest: $Out ($((Get-Content $Out -Raw | ConvertFrom-Json).Count) Dateien)" }
    'Install' {
        "Installer SHA256: " + (Get-FileHash -LiteralPath $Setup -Algorithm SHA256).Hash
        # WaitForExit statt -Wait: -Wait wartet in PowerShell 5.1 auf den ganzen Prozessbaum
        $p = Start-Process -FilePath $Setup -ArgumentList '/S' -PassThru
        $t0 = Get-Date; if (-not $p.WaitForExit(1200000)) { $p | Stop-Process -Force; 'FAIL I2: Installer nach 1200 s nicht beendet'; exit 1 }; 'Installationsdauer: {0:N0} s' -f ((Get-Date) - $t0).TotalSeconds
        "Installer-Exit: $($p.ExitCode)"
        if ($p.ExitCode -ne 0) { "FAIL I2: Installer-Exit $($p.ExitCode)"; exit 1 }
        $seen = $false; for ($i = 0; $i -lt 30; $i++) { if (Get-Process -Name 'Argus' -ErrorAction SilentlyContinue) { $seen = $true; break }; Start-Sleep -Seconds 2 }
        if ($seen) { 'FAIL I2: Argus wurde nach der stillen Installation automatisch gestartet'; exit 1 } else { 'PASS I2: kein automatischer Erststart in 60 s (zusätzliche Kontrolle; Nachweis über die Installer-Vorlage gesondert)' }
        "Installationsordner (Registry): " + (Get-InstallDir)
    }
    'Compare' {
        $root = Get-InstallDir; $exp = @{}; foreach ($e in (Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json)) { $exp[$e.p] = $e }
        $act = @{}; foreach ($e in (Get-Tree $root)) { $act[$e.p] = $e }
        $bad = @()
        foreach ($k in $exp.Keys) { if (-not $act.ContainsKey($k)) { $bad += "fehlt: $k" } elseif ($act[$k].h -ne $exp[$k].h) { $bad += "geändert: $k" } }
        foreach ($k in $act.Keys) { if (-not $exp.ContainsKey($k) -and $Allow -notcontains $k) { $bad += "zusätzlich: $k" } }
        foreach ($f in 'resources\app\boot.js', 'resources\app\main.js', 'resources\app\selfimprove.js', 'resources\app\files.js', 'resources\app\actions.js') { if ($act[$f]) { "$f  $($act[$f].h)" } }
        if ($bad.Count) { $bad | ForEach-Object { "FAIL I3: $_" }; exit 1 } else { "PASS I3: Laufzeitbaum entspricht dem Manifest ($($act.Count) Dateien)" }
    }
    'Fixture' {
        $ud = Join-Path $env:APPDATA 'argus-desktop'
        New-Item -ItemType Directory -Force "$ud\backups\2026-01-01", "$ud\selfimprove-stage", "$ud\selfimprove-verworfen-alt" | Out-Null
        Set-Content "$ud\.umzug-von-jarvis.json" '{}'; Set-Content "$ud\selfimprove-pending.json" ('{"backup":"' + ($ud -replace '\\', '\\') + '\\backups\\2026-01-01","started":true}')
        Set-Content "$ud\backups\2026-01-01\main.js" '// SENTINEL-ALT'; Set-Content "$ud\selfimprove-stage\main.js" '// SENTINEL-STAGE'; Set-Content "$ud\selfimprove-verworfen-alt\sv.js" '// SV'
        $root = Get-InstallDir; Add-Content "$root\resources\app\app\js\01-grundlagen.js" "`n// SENTINEL-GEAENDERT"; Set-Content "$root\resources\app\sentinel-zusatz.js" '// SENTINEL'
        Get-ChildItem $ud -Recurse -File | ForEach-Object { "{0}  {1}" -f (Get-FileHash $_.FullName).Hash, $_.FullName.Substring($ud.Length + 1) } | Set-Content (Join-Path $env:TEMP 'fixture-hashes.txt')
        "Fixture I4 angelegt; Hashes: $env:TEMP\fixture-hashes.txt"
    }
}
