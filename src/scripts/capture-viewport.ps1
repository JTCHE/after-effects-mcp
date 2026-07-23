param(
    [Parameter(Mandatory=$true)][string]$OutPath,
    [int]$MaxWidth = 1600,
    # Project file name (e.g. "MyProject.aep") from the bridge's prepareViewportCapture
    # call — After Effects puts it in the window title, so when more than one AfterFX.exe
    # instance is running this picks the one actually driving the bridge instead of
    # whichever instance the OS happens to list first.
    [string]$ProjectHint = ""
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class AeCapture {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
# Without this, GetWindowRect returns logical (96-DPI-virtualized) coordinates while
# PrintWindow captures physical pixels — on a scaled display the two disagree.
[AeCapture]::SetProcessDPIAware() | Out-Null

$procs = Get-Process -Name "AfterFX" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
$proc = $null
if ($ProjectHint) {
    $proc = $procs | Where-Object {
        $sb = New-Object System.Text.StringBuilder 512
        [AeCapture]::GetWindowText($_.MainWindowHandle, $sb, $sb.Capacity) | Out-Null
        $sb.ToString() -like "*$ProjectHint*"
    } | Select-Object -First 1
}
if (-not $proc) { $proc = $procs | Select-Object -First 1 }
if (-not $proc) {
    Write-Output "ERROR: After Effects process not found (or has no main window)."
    exit 1
}

$mainHwnd = $proc.MainWindowHandle
if ([AeCapture]::IsIconic($mainHwnd)) {
    Write-Output "ERROR: After Effects window is minimized."
    exit 1
}

$mainRect = New-Object AeCapture+RECT
[AeCapture]::GetWindowRect($mainHwnd, [ref]$mainRect) | Out-Null
$width = $mainRect.Right - $mainRect.Left
$height = $mainRect.Bottom - $mainRect.Top
if ($width -le 0 -or $height -le 0) {
    Write-Output "ERROR: Could not read After Effects window bounds."
    exit 1
}

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
# PW_RENDERFULLCONTENT (2) — plain BitBlt (flag 0) returns black for AE's GPU-composited viewport.
$captured = [AeCapture]::PrintWindow($mainHwnd, $hdc, 2)
$graphics.ReleaseHdc($hdc) | Out-Null
$graphics.Dispose()

if (-not $captured) {
    $bitmap.Dispose()
    Write-Output "ERROR: PrintWindow capture failed."
    exit 1
}

# No viewer-panel cropping: AE's custom UI toolkit exposes zero semantic panel identity at
# the OS level (confirmed via both GetWindowText/class name and UI Automation), so isolating
# just the viewer's render surface required a geometry heuristic (top-docked-row + largest
# frame) that broke on dock layouts other than the one it was written against. Vision models
# read the viewport fine inside the full AE window, so we return the whole window instead —
# no panel-finding, no fragility across layouts.
if ($width -gt $MaxWidth) {
    $scale = $MaxWidth / $width
    $newWidth = $MaxWidth
    $newHeight = [int]([Math]::Round($height * $scale))
    $resized = New-Object System.Drawing.Bitmap $bitmap, $newWidth, $newHeight
    $bitmap.Dispose()
    $bitmap = $resized
}

$bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Output "OK"
