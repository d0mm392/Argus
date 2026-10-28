# Vorprüfung der Test-VM (Plan UMG-1 bis UMG-6, V-Prüfungen). Bricht mit Exit-Code 1 ab, wenn eine Voraussetzung fehlt.
# NUR in der Test-VM ausführen. Ändert nichts.
$ErrorActionPreference = 'Continue'
$fail = New-Object System.Collections.Generic.List[string]
$ok = New-Object System.Collections.Generic.List[string]
function Need($cond, $text) { if ($cond) { $ok.Add($text) } else { $fail.Add($text) } }

# Keine Daten des Projektinhabers, kein Claude, kein Ollama/Strata
foreach ($p in @("$env:APPDATA\argus-desktop", "$env:APPDATA\jarvis-desktop", "$env:APPDATA\Jarvis", "$env:USERPROFILE\Argus-Gedaechtnis", "$env:USERPROFILE\Jarvis-Gedaechtnis",
    "$env:APPDATA\Claude", "$env:USERPROFILE\.claude", "$env:USERPROFILE\.local\bin\claude.exe", "$env:APPDATA\npm\claude.cmd", "$env:LOCALAPPDATA\Programs\Ollama")) {
    Need (-not (Test-Path -LiteralPath $p)) "nicht vorhanden: $p"
}
Need (-not (Get-Process -Name 'ollama*', 'claude*' -ErrorAction SilentlyContinue)) "keine Prozesse ollama*/claude*"
foreach ($port in 11434, 8080) { Need (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) "Port $port frei" }
# Kein Netz nach außen, Loopback funktioniert
$out = Test-NetConnection 1.1.1.1 -Port 443 -WarningAction SilentlyContinue -InformationLevel Quiet
Need (-not $out) "kein Netz nach außen (1.1.1.1:443 nicht erreichbar)"
$dns = $true; try { Resolve-DnsName example.com -ErrorAction Stop | Out-Null } catch { $dns = $false }
Need (-not $dns) "keine Namensauflösung nach außen"
# Keine Host-Freigaben: nur lokale Festplatten
$drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.DisplayRoot -like '\\*' }
Need (-not $drives) "keine Netzlaufwerke/Host-Freigaben"
# Standardkonto ohne aktive Adminrechte
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Need (-not $admin) "Lauf ohne Adminrechte"

$ok | ForEach-Object { "OK    $_" }
$fail | ForEach-Object { "FEHLT $_" }
if ($fail.Count) { "VORPRÜFUNG NICHT BESTANDEN ($($fail.Count) Punkte) - keine Tests starten."; exit 1 }
"VORPRÜFUNG BESTANDEN"; exit 0
