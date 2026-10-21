# Meldet 8-mal pro Sekunde das vorderste Fenster (Programm, Klasse, Rechteck in Bildschirm-Pixeln), nur lesend.
param([int]$Parent = 0, [string]$Apps = "")
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out int[] r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
try { [void][W]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { [void][W]::SetProcessDPIAware() }
$names = @{}; $last = ""; $bg = @(); $tick = 0; $trk = [IntPtr]::Zero
$shell = "Progman|WorkerW|Shell_TrayWnd|Shell_SecondaryTrayWnd|NotifyIconOverflowWindow|TopLevelWindowForOverflowXamlIsland|Xaml_WindowedPopupClass|Windows.UI.Core.CoreWindow|ForegroundStaging|MultitaskingViewFrame|XamlExplorerHostIslandWindow"
$appList = @($Apps -split "[,;]" | % { $_.Trim().ToLower() -replace "\.exe$", "" } | ? { $_ })
while ($true) {
  if ($Parent -gt 0 -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { break }
  $o = @{ none = $true }
  # Gewünschte Programme auch dann finden, wenn sie gerade nicht vorn liegen (etwa direkt nach dem Start von Argus), einmal pro Sekunde
  if ($appList.Count -gt 0 -and ($tick++ % 8) -eq 0) {
    $nb = @()
    foreach ($n in $appList) {
      try {
        $pr = Get-Process -Name $n -ErrorAction SilentlyContinue | ? { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if ($pr -and -not [W]::IsIconic($pr.MainWindowHandle)) {
          $r2 = New-Object W+RECT
          if ([W]::DwmGetWindowAttribute($pr.MainWindowHandle, 9, [ref]$r2, 16) -eq 0 -and ($r2.R - $r2.L) -gt 50) { $nb += @{ app = $n; l = $r2.L; t = $r2.T; r = $r2.R; b = $r2.B } }
        }
      } catch {}
    }
    $bg = $nb
  }
  try {
    $h = [W]::GetForegroundWindow()
    if ($h -ne [IntPtr]::Zero -and -not [W]::IsIconic($h)) {
      $pid2 = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$pid2)
      $sb = New-Object System.Text.StringBuilder 256; [void][W]::GetClassName($h, $sb, 256)
      $r = New-Object W+RECT
      if ([W]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -eq 0) {
        if (-not $names.ContainsKey($pid2)) { $names[$pid2] = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName }
        if ($pid2 -ne $Parent -and [string]$names[$pid2] -notmatch '^(SearchHost|SearchApp|StartMenuExperienceHost|ShellExperienceHost|TextInputHost|LockApp|SystemSettings|ApplicationFrameHost|Widgets|WidgetBoard)$' -and $sb.ToString() -notmatch "^($shell)$" -and ($r.R - $r.L) -ge 200 -and ($r.B - $r.T) -ge 150) { $trk = $h }
        $o = @{ pid = $pid2; app = [string]$names[$pid2]; cls = $sb.ToString(); max = [W]::IsZoomed($h); l = $r.L; t = $r.T; r = $r.R; b = $r.B }
      }
    }
  } catch {}
  # Verfolgtes Fenster minimiert, geschlossen oder unsichtbar: Argus soll die Aussparung schließen
  if ($trk -ne [IntPtr]::Zero -and (-not [W]::IsWindow($trk) -or [W]::IsIconic($trk) -or -not [W]::IsWindowVisible($trk))) { $o.tg = $true }
  if ($appList.Count -gt 0) { $o.bg = @($bg) }
  $j = $o | ConvertTo-Json -Compress -Depth 4
  if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  Start-Sleep -Milliseconds 120
}
