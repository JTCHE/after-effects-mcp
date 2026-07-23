param(
    [Parameter(Mandatory=$true)][string]$OutPath,
    # SendKeys-syntax combo for AE's "Copy Frame to Clipboard" shortcut, e.g. "^%+{F5}"
    # for Ctrl+Alt+Shift+F5 -- resolved on the Node side from AE's own keyboard preset file.
    [Parameter(Mandatory=$true)][string]$SendKeysCombo,
    [string]$ProjectHint = "",
    [int]$TimeoutMs = 3000
)

# STA is required for System.Windows.Forms.Clipboard; launch this script with `powershell -sta`.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class AeFrameCapture {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);

    // A plain SetForegroundWindow call from a background process is routinely denied by
    // Windows' foreground-lock heuristic (confirmed live: WScript.Shell.AppActivate reported
    // success while focus silently stayed on the caller's own window). Attaching this
    // thread's input queue to both the current foreground window's thread and the target's
    // is the standard workaround -- it grants the temporary permission the OS otherwise
    // withholds, then both attachments are torn down immediately after.
    public static bool ForceForeground(IntPtr target) {
        IntPtr fg = GetForegroundWindow();
        uint dummy1, dummy2;
        uint fgThread = GetWindowThreadProcessId(fg, out dummy1);
        uint targetThread = GetWindowThreadProcessId(target, out dummy2);
        uint curThread = GetCurrentThreadId();
        bool a1 = AttachThreadInput(curThread, fgThread, true);
        bool a2 = AttachThreadInput(curThread, targetThread, true);
        // Only restore if actually minimized -- SW_RESTORE unconditionally also kicks a
        // maximized/fullscreen window out of that state, which is a disruptive side effect
        // this capture has no business causing.
        if (IsIconic(target)) ShowWindow(target, 9); // SW_RESTORE
        BringWindowToTop(target);
        bool result = SetForegroundWindow(target);
        if (a1) AttachThreadInput(curThread, fgThread, false);
        if (a2) AttachThreadInput(curThread, targetThread, false);
        return result;
    }
}
"@

$procs = Get-Process -Name "AfterFX" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
$proc = $null
if ($ProjectHint) {
    $proc = $procs | Where-Object {
        $sb = New-Object System.Text.StringBuilder 512
        [AeFrameCapture]::GetWindowText($_.MainWindowHandle, $sb, $sb.Capacity) | Out-Null
        $sb.ToString() -like "*$ProjectHint*"
    } | Select-Object -First 1
}
if (-not $proc) { $proc = $procs | Select-Object -First 1 }
if (-not $proc) {
    Write-Output "ERROR: After Effects process not found (or has no main window)."
    exit 1
}

$activated = [AeFrameCapture]::ForceForeground($proc.MainWindowHandle)
Start-Sleep -Milliseconds 150
if (-not $activated -or [AeFrameCapture]::GetForegroundWindow() -ne $proc.MainWindowHandle) {
    Write-Output "ERROR: Could not bring After Effects to the foreground -- the Copy Frame to Clipboard shortcut needs real OS focus to reach the viewer."
    exit 1
}

$baselineSeq = [AeFrameCapture]::GetClipboardSequenceNumber()
[System.Windows.Forms.SendKeys]::SendWait($SendKeysCombo)

$deadline = (Get-Date).AddMilliseconds($TimeoutMs)
while ((Get-Date) -lt $deadline -and [AeFrameCapture]::GetClipboardSequenceNumber() -eq $baselineSeq) {
    Start-Sleep -Milliseconds 50
}
if ([AeFrameCapture]::GetClipboardSequenceNumber() -eq $baselineSeq) {
    Write-Output "ERROR: Clipboard did not change after sending the shortcut. Confirm 'Copy Frame to Clipboard' is still bound to $SendKeysCombo and the comp viewer has an active frame."
    exit 1
}

# AE's "Copy Frame to Clipboard" doesn't put a classic CF_BITMAP/CF_DIB on the clipboard
# (System.Windows.Forms.Clipboard.GetImage() finds nothing) -- it writes a real PNG file to
# %TEMP% and puts a FileDrop reference to it, plus the raw PNG bytes under a "PNG" clipboard
# format. FileDrop is preferred: it's the exact file AE wrote, no bitmap re-encode/alpha risk.
# Clipboard access is inherently racy (clipboard managers, AV scanners, RDP sync can hold it
# briefly), so retry rather than treat one failed read as final.
$saved = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        $data = [System.Windows.Forms.Clipboard]::GetDataObject()
        if ($data.GetDataPresent('FileDrop')) {
            $files = $data.GetData('FileDrop')
            if ($files -and $files.Count -gt 0 -and (Test-Path $files[0])) {
                Copy-Item -Path $files[0] -Destination $OutPath -Force
                $saved = $true
                break
            }
        }
        if ($data.GetDataPresent('PNG')) {
            $stream = $data.GetData('PNG')
            if ($stream) {
                $bytes = New-Object byte[] $stream.Length
                $stream.Read($bytes, 0, $stream.Length) | Out-Null
                [System.IO.File]::WriteAllBytes($OutPath, $bytes)
                $saved = $true
                break
            }
        }
        if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
            $image = [System.Windows.Forms.Clipboard]::GetImage()
            if ($image) {
                $image.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
                $image.Dispose()
                $saved = $true
                break
            }
        }
    } catch { }
    Start-Sleep -Milliseconds 100
}
if (-not $saved) {
    Write-Output "ERROR: Clipboard changed but did not contain a readable image (checked FileDrop, PNG format, and GetImage())."
    exit 1
}

Write-Output "OK"
