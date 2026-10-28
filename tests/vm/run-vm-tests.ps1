# Führt in der Test-VM alle Hotfix-Tests aus: Vorprüfung, Node-Tests (Node der VM und Electron-Node), Electron U1-U9.
# Voraussetzung: Arbeitsstand samt node_modules (npm ci in der Bau-Phase) liegt unter $Repo. Nur in der Test-VM ausführen.
param([string]$Repo = (Resolve-Path "$PSScriptRoot\..\..").Path, [string]$Out = "C:\VMTest\ergebnisse")
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$log = Join-Path $Out ("vm-lauf-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
function L($t) { $t | Tee-Object -FilePath $log -Append }
if (Get-Command git -ErrorAction SilentlyContinue) { L ("Commit: " + (git -C $Repo rev-parse HEAD)); L ("Arbeitsstand sauber: " + [string]::IsNullOrEmpty((git -C $Repo status --porcelain))) }
else { L ("Commit (aus COMMIT.txt des git-archive-Pakets): " + (Get-Content (Join-Path $Repo 'COMMIT.txt') -ErrorAction SilentlyContinue)); L "Arbeitsstand: unveränderter git-archive-Export, kein git in der VM" }
& "$PSScriptRoot\vm-preflight.ps1" 2>&1 | ForEach-Object { L $_ }
if ($LASTEXITCODE -ne 0) { L "ABBRUCH: Vorprüfung nicht bestanden"; exit 1 }
$electron = Join-Path $Repo 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { L "ABBRUCH: $electron fehlt (npm ci in der Bau-Phase)"; exit 1 }
$env:ARGUS_TEST_ROOT = Join-Path $Out 'node'; $env:ARGUS_VM_TESTROOT = Join-Path $Out 'electron'
$summary = @()
# Node-Tests mit der Node-Laufzeit von Electron 33
$env:ELECTRON_RUN_AS_NODE = '1'
$p = Start-Process $electron -ArgumentList 'tests\hotfix.test.js' -WorkingDirectory $Repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $Out 'node-electron.log')
Remove-Item Env:ELECTRON_RUN_AS_NODE; $summary += "Node-Tests (Electron-Node): Exit $($p.ExitCode)"
# Electron U1-U6, U8, U9
$p = Start-Process $electron -ArgumentList 'tests\vm\ui-hotfix.test.js' -WorkingDirectory $Repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $Out 'ui-hotfix.log')
$summary += "U1-U6, U8, U9: Exit $($p.ExitCode)"
# U7 drei Läufe in getrennten Prozessen
foreach ($i in 1..3) { $p = Start-Process $electron -ArgumentList 'tests\vm\ui-hotfix-boot.test.js', "$i" -WorkingDirectory $Repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $Out "u7-$i.log"); $summary += "U7 Lauf ${i}: Exit $($p.ExitCode)" }
$summary | ForEach-Object { L $_ }
Get-ChildItem $Out -Filter *.log | Where-Object { $_.FullName -ne $log } | ForEach-Object { Select-String -Path $_.FullName -Pattern '^(PASS|FAIL|ERGEBNIS|BEKANNT)|^# (pass|fail)' } | ForEach-Object { L $_.Line }
if ($summary -match 'Exit [^0]') { L "GESAMT: NICHT BESTANDEN"; exit 1 } else { L "GESAMT: BESTANDEN (nur wenn jede Zeile oben Exit 0 zeigt)"; exit 0 }
