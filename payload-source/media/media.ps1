# Jarvis "Laeuft gerade": liest ueber die Windows-Mediensteuerung (wie das Lautstaerke-Popup) Titel, Interpret, Cover
# und Status der Musik-App (Apple Music bevorzugt, sonst die aktuelle, z. B. Spotify oder ein Browser-Tab).
# Schreibt eine JSON-Zeile pro Aenderung auf stdout. Befehle (play/next/prev) kommen ueber die Datei -Cmd.
param([string]$Cmd)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(5000); $task.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
# Lautstaerke: Windows-Core-Audio. Bevorzugt die Lautstaerke der Musik-App selbst (wie im Lautstaerkemixer), sonst die Gesamtlautstaerke
try { Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
namespace JV {
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
[ComImport, Guid("D666063F-1543-4E89-ACB6-4C7D2C1AE3C5"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int R1(); int R2(); int R3(); int R4(); [PreserveSig] int SetMasterVolumeLevelScalar(float v, ref Guid g); int R6(); [PreserveSig] int GetMasterVolumeLevelScalar(out float v); }
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int R1(); int R2(); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 { int R1(); int R2(); int R3(); int R4(); int R5(); int R6(); int R7(); int R8(); int R9(); int R10(); int R11(); [PreserveSig] int GetProcessId(out uint pid); }
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume { [PreserveSig] int SetMasterVolume(float v, ref Guid g); [PreserveSig] int GetMasterVolume(out float v); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
public static class Vol {
  static IMMDevice Dev() { var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator()); IMMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d); return d; }
  static ISimpleAudioVolume App(string key) {
    if (string.IsNullOrEmpty(key) || key.Length < 3) return null;
    var g = typeof(IAudioSessionManager2).GUID; object o; Dev().Activate(ref g, 23, IntPtr.Zero, out o);
    IAudioSessionEnumerator en; ((IAudioSessionManager2)o).GetSessionEnumerator(out en); int n; en.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 c; en.GetSession(i, out c); uint pid; c.GetProcessId(out pid); if (pid == 0) continue;
      string name = ""; try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { continue; }
      if (name.Contains(key) || key.Contains(name)) return (ISimpleAudioVolume)c;
    }
    return null;
  }
  static IAudioEndpointVolume Master() { var g = typeof(IAudioEndpointVolume).GUID; object o; Dev().Activate(ref g, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o; }
  public static float Get(string key) { float v; var a = App(key); if (a != null) { a.GetMasterVolume(out v); return v; } Master().GetMasterVolumeLevelScalar(out v); return -1 - v; }
  public static void Set(string key, float v) { var z = Guid.Empty; var a = App(key); if (a != null) a.SetMasterVolume(v, ref z); else Master().SetMasterVolumeLevelScalar(v, ref z); }
}
}
"@
} catch { }
# Prozessname aus der App-Kennung der Mediensteuerung: Apple Music -> applemusic, Spotify.exe -> spotify, "Chrome" -> chrome
function AppKey($id) {
  if ($id -match "AppleMusic|AppleInc") { return "applemusic" }
  if ($id -match "([\w\-]+)\.exe") { return $Matches[1].ToLower() }
  if ($id -match "!(\w+)$") { return $Matches[1].ToLower() }
  return ($id -replace "[^\w]", "").ToLower()
}
$M = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$mgr = Await ($M::RequestAsync()) $M

function Pick() {
  $all = @($mgr.GetSessions())
  $am = $all | Where-Object { $_.SourceAppUserModelId -match "AppleMusic|AppleInc|iTunes" } | Select-Object -First 1
  if ($am) { return $am }
  return $mgr.GetCurrentSession()
}
function Cover($props) {
  try {
    if (-not $props.Thumbnail) { return "" }
    $s = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $n = [uint32]$s.Size
    if ($n -le 0 -or $n -gt 4000000) { return "" }
    # DataReader statt .NET-Stream: funktioniert auch, wenn PowerShell den WinRT-Stream nicht umwandeln kann
    $r = New-Object Windows.Storage.Streams.DataReader($s.GetInputStreamAt(0))
    [void](Await ($r.LoadAsync($n)) ([uint32]))
    $bytes = New-Object byte[] $n; $r.ReadBytes($bytes)
    $type = if ($s.ContentType) { $s.ContentType } else { "image/png" }
    return "data:" + $type + ";base64," + [Convert]::ToBase64String($bytes)
  } catch { return "" }
}
$lastKey = ""; $lastSig = ""; $art = ""; $idle = 0; $volT = 0; $vol = $null
while ($true) {
  try {
    if ($Cmd -and (Test-Path $Cmd)) {
      $c = (Get-Content $Cmd -Raw).Trim(); Remove-Item $Cmd -Force
      $s = Pick
      if ($s) {
        switch ($c) {
          "play" { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
          "next" { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
          "prev" { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
        }
        if ($c -match "^vol:([\d.]+)$") { try { [JV.Vol]::Set((AppKey $s.SourceAppUserModelId), [float][Math]::Min(1, [double]$Matches[1])); $volT = 0 } catch {} }
      }
    }
    $s = Pick
    if (-not $s) { $o = @{ on = $false } }
    else {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) { $art = Cover $p; $lastKey = $key; $sendArt = $true } else { $sendArt = $false }
      $tl = $s.GetTimelineProperties()
      $st = $s.GetPlaybackInfo().PlaybackStatus.ToString()
      $o = @{ on = $true; app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; playing = ($st -eq "Playing");
        pos = [math]::Round($tl.Position.TotalSeconds); len = [math]::Round($tl.EndTime.TotalSeconds); t = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }
      if ($sendArt) { $o.art = $art }
      # Lautstaerke alle ~2 s lesen (negativ = Gesamtlautstaerke, weil die App keine eigene Audiositzung hat)
      if (($volT++ % 5) -eq 0) { try { $vol = [math]::Round([JV.Vol]::Get((AppKey $s.SourceAppUserModelId)), 3) } catch { $vol = $null } }
      if ($vol -ne $null) { $o.vol = $vol }
    }
    $sig = ($o.Keys | Where-Object { $_ -ne "t" -and $_ -ne "art" -and $_ -ne "pos" } | Sort-Object | ForEach-Object { "$_=$($o[$_])" }) -join ";"
    # Position nur alle paar Sekunden mitschicken, dazwischen rechnet Jarvis selbst weiter
    if ($sig -ne $lastSig -or $o.art -or ($o.on -and ($idle++ % 5) -eq 0)) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush(); $lastSig = $sig }
  } catch { [Console]::Out.WriteLine((@{ on = $false; err = $_.Exception.Message } | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 400
}
