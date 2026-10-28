param([Parameter(Mandatory)][long]$WindowHandle,[Parameter(Mandatory)][string]$Out)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
public static class ArgusWindowCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect bounds);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr window,IntPtr device,uint flags);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 public static void Save(long handle,string file) {
  SetThreadDpiAwarenessContext(new IntPtr(-4));
  Rect r;var window=new IntPtr(handle);if(!GetWindowRect(window,out r))throw new Exception("Test window bounds unavailable");
  using(var image=new Bitmap(r.right-r.left,r.bottom-r.top,PixelFormat.Format32bppArgb))
  using(var graphics=Graphics.FromImage(image)){
   var device=graphics.GetHdc();bool ok;
   try{ok=PrintWindow(window,device,2);}finally{graphics.ReleaseHdc(device);}
   if(!ok)throw new Exception("Test window capture unavailable");
   image.Save(file,ImageFormat.Png);
  }
 }
}
'@
[ArgusWindowCapture]::Save($WindowHandle,$Out)
