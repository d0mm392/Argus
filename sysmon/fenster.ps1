# Meldet 4-mal pro Sekunde das vorderste Fenster (Programm, Klasse, Rechteck in Bildschirm-Pixeln), nur lesend.
param([int]$Parent = 0)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out int[] r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
[void][W]::SetProcessDPIAware()
$names = @{}; $last = ""
while ($true) {
  if ($Parent -gt 0 -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { break }
  $o = @{ none = $true }
  try {
    $h = [W]::GetForegroundWindow()
    if ($h -ne [IntPtr]::Zero -and -not [W]::IsIconic($h)) {
      $pid2 = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$pid2)
      $sb = New-Object System.Text.StringBuilder 256; [void][W]::GetClassName($h, $sb, 256)
      $r = New-Object W+RECT
      if ([W]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -eq 0) {
        if (-not $names.ContainsKey($pid2)) { $names[$pid2] = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName }
        $o = @{ pid = $pid2; app = [string]$names[$pid2]; cls = $sb.ToString(); max = [W]::IsZoomed($h); l = $r.L; t = $r.T; r = $r.R; b = $r.B }
      }
    }
  } catch {}
  $j = $o | ConvertTo-Json -Compress
  if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  Start-Sleep -Milliseconds 250
}
