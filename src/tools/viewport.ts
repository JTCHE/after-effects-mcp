import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";

// Reads AE's own keyboard-preset files to find the live binding for "Copy Frame to
// Clipboard" (AE 26.3+), instead of hardcoding a shortcut that a user may have rebound.
// AE's prefs file names its active preset ("Shortcut File Location"); that preset file
// (under .../<version>/aeks/) lists "CopyFrameToClipboard" = "(Ctrl+Alt+Shift+F5)".
function resolveCopyFrameShortcut(aeVersion: string): string | null {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const baseDir = path.join(appData, "Adobe", "After Effects");
  const verDir = path.join(baseDir, aeVersion);
  if (!fs.existsSync(verDir)) return null;

  const prefsFile = path.join(verDir, `Adobe After Effects ${aeVersion} Prefs.txt`);
  let shortcutFileName = "After Effects Default.txt";
  if (fs.existsSync(prefsFile)) {
    const locMatch = fs.readFileSync(prefsFile, "utf8").match(/"Shortcut File Location"\s*=\s*"([^"]+)"/);
    if (locMatch) shortcutFileName = locMatch[1];
  }

  const aeksFile = path.join(verDir, "aeks", shortcutFileName);
  if (!fs.existsSync(aeksFile)) return null;
  const cmdMatch = fs.readFileSync(aeksFile, "utf8").match(/"CopyFrameToClipboard"\s*=\s*"\(([^)]*)\)"/);
  return cmdMatch && cmdMatch[1] ? cmdMatch[1] : null;
}

// "Ctrl+Alt+Shift+F5" -> SendKeys syntax "^%+{F5}".
function toSendKeysCombo(combo: string): string {
  const parts = combo.split("+");
  const key = parts.pop()!;
  let prefix = "";
  for (const p of parts) {
    if (/^ctrl$/i.test(p)) prefix += "^";
    else if (/^alt$/i.test(p)) prefix += "%";
    else if (/^shift$/i.test(p)) prefix += "+";
  }
  const needsBraces = key.length > 1 || "+^%~(){}[]".includes(key);
  return prefix + (needsBraces ? `{${key}}` : key);
}

// Windows-only OS-level capture of the AE application window — what's actually on
// screen (viewport, timeline, panel chrome), not a re-render via saveFrameToPng.
// Runs entirely on the Node side (PowerShell + user32 PrintWindow); never touches the
// bridge, so it still works to diagnose a frozen/stalled bridge panel.
export function registerViewportTools(server: McpServer, scriptsDir: string) {
  server.tool(
    "get-viewport-screenshot",
    "Capture a screenshot of the After Effects application window (OS-level window capture — " +
    "what's actually rendered on screen, including the comp viewport, timeline and panel state). " +
    "Windows-only. Use this to visually verify layout/centering/scaling instead of guessing from " +
    "property values, or to see what's on screen if the MCP Bridge panel appears stalled. By default " +
    "the target comp's viewer is zoomed/panned to 'Fit' before the shot and restored to " +
    "its previous zoom afterward, so the capture isn't an arbitrary pan/zoom crop; this step is " +
    "best-effort via the bridge and is silently skipped if the bridge is unresponsive.",
    {
      maxWidth: z.number().int().positive().optional().describe("Downscale to this max width in pixels before returning (default 1600)."),
      compName: z.string().optional().describe("Composition to fit/center before capture. Falls back to compIndex, then the active comp. Ignored if fitToView is false."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the composition to fit/center before capture. Prefer compName."),
      time: z.number().nonnegative().optional().describe("Move the comp's playhead to this time (seconds) before capture. Ignored if fitToView is false."),
      fitToView: z.boolean().optional().describe("Zoom the comp viewer to fit and restore afterward (default true). Set false to capture whatever pan/zoom is currently on screen.")
    },
    async ({ maxWidth = 1600, compName, compIndex, time, fitToView = true }) => {
      if (process.platform !== "win32") {
        return {
          content: [{ type: "text", text: "get-viewport-screenshot is Windows-only." }],
          isError: true
        };
      }
      let savedZoom: number | null = null;
      let fitNote = "";
      // Which AE process actually owns this comp/project — passed to the capture script
      // so it can pick the right window when multiple AfterFX.exe instances are running
      // (PrintWindow otherwise grabs whichever instance's window the OS lists first).
      let projectHint = "";
      if (fitToView) {
        try {
          const prep = await runAndWait("prepareViewportCapture", { compName, compIndex, time }, 15000);
          const prepText = prep.content[0]?.text ?? "";
          const parsed = JSON.parse(prepText);
          if (parsed.status === "success") {
            savedZoom = parsed.savedZoom ?? null;
            projectHint = parsed.projectFile ?? "";
            fitNote = ` (comp '${parsed.compName}' in project '${projectHint}')`;
          } else {
            fitNote = ` (fit-to-view skipped: ${parsed.message || "bridge reported an error"})`;
          }
        } catch (error) {
          fitNote = ` (fit-to-view skipped: bridge unresponsive)`;
        }
      }

      try {
        const outPath = path.join(os.tmpdir(), `ae_viewport_${Date.now()}.png`);
        const scriptPath = path.join(scriptsDir, "capture-viewport.ps1");
        const hintArg = projectHint ? ` -ProjectHint "${projectHint.replace(/"/g, '""')}"` : "";
        const stdout = execSync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -OutPath "${outPath}" -MaxWidth ${maxWidth}${hintArg}`,
          { encoding: "utf8" }
        ).trim();

        if (stdout.startsWith("ERROR:") || !fs.existsSync(outPath)) {
          return {
            content: [{ type: "text", text: (stdout || "Screenshot capture failed (no output file produced).") + fitNote }],
            isError: true
          };
        }

        const imageData = fs.readFileSync(outPath).toString("base64");
        return {
          content: [
            { type: "image", data: imageData, mimeType: "image/png" },
            { type: "text", text: `Saved to ${outPath}${fitNote}` }
          ]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error capturing screenshot: ${String(error)}${fitNote}` }],
          isError: true
        };
      } finally {
        if (savedZoom !== null) {
          try {
            await runAndWait("restoreViewportZoom", { compName, compIndex, zoom: savedZoom }, 15000);
          } catch { /* best-effort restore; leave viewer at fit zoom if bridge dropped */ }
        }
      }
    }
  );

  // Uses AE 26.3+'s "Copy Frame to Clipboard" (beta) to get a properly rendered,
  // viewport-only frame instead of get-viewport-screenshot's whole-window crop.
  // Different failure shape than that tool (steals OS foreground, beta-only, depends
  // on clipboard state), so it's a separate tool rather than a flag on the existing one.
  server.tool(
    "get-viewport-frame",
    "Capture just the composition viewport's rendered frame (cropped, not the whole AE " +
    "window) using After Effects 26.3+'s beta 'Copy Frame to Clipboard' shortcut. Requires " +
    "AE 26.3 or newer. Briefly steals OS window focus to send the keyboard shortcut, so avoid " +
    "calling this while the user is actively typing elsewhere. Falls back with a clear error " +
    "if the AE version is too old, the shortcut isn't bound, or the clipboard read fails — use " +
    "get-viewport-screenshot instead in those cases.",
    {
      compName: z.string().optional().describe("Composition to open/focus in the viewer before capture. Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the composition to open/focus. Prefer compName."),
      time: z.number().nonnegative().optional().describe("Move the comp's playhead to this time (seconds) before capture.")
    },
    async ({ compName, compIndex, time }) => {
      if (process.platform !== "win32") {
        return { content: [{ type: "text", text: "get-viewport-frame is Windows-only." }], isError: true };
      }

      let aeVersion = "";
      let projectHint = "";
      let prepNote = "";
      try {
        // Best-effort, same as get-viewport-screenshot: a failed Fit/focus attempt
        // shouldn't block the capture, just costs us the projectHint disambiguator.
        // skipFit: Copy Frame to Clipboard captures the full rendered viewport regardless
        // of on-screen zoom, so there's no need to fit-to-view (and no exposure to that
        // step's known failure mode) the way get-viewport-screenshot's window crop needs.
        const prep = await runAndWait("prepareViewportCapture", { compName, compIndex, time, skipFit: true }, 15000);
        const parsed = JSON.parse(prep.content[0]?.text ?? "{}");
        if (parsed.status === "success") {
          projectHint = parsed.projectFile ?? "";
          aeVersion = String(parsed.aeVersion ?? "").split("x")[0]; // "26.3x87" -> "26.3"
        } else {
          prepNote = ` (viewer focus skipped: ${parsed.message || "bridge reported an error"})`;
          // Fall back to a standalone call only when prepareViewportCapture itself failed
          // (so there's no risk of the rapid-back-to-back-calls stall in the common case).
          const versionResult = await runAndWait("runJsx", { code: "app.version" }, 10000);
          const versionParsed = JSON.parse(versionResult.content[0]?.text ?? "{}");
          aeVersion = String(versionParsed.result ?? "").split("x")[0];
        }
      } catch {
        return { content: [{ type: "text", text: "Error: bridge unresponsive — could not read the AE version." }], isError: true };
      }

      if (!aeVersion) {
        return { content: [{ type: "text", text: "Could not determine the After Effects version from the bridge." }], isError: true };
      }

      const shortcut = resolveCopyFrameShortcut(aeVersion);
      if (!shortcut) {
        return {
          content: [{
            type: "text",
            text: `Could not find a "Copy Frame to Clipboard" shortcut binding for After Effects ${aeVersion}. ` +
              `This feature needs AE 26.3+ (beta) with a shortcut assigned to it (Edit > Keyboard Shortcuts > search ` +
              `"Copy Frame"). Use get-viewport-screenshot instead.`
          }],
          isError: true
        };
      }

      try {
        const outPath = path.join(os.tmpdir(), `ae_frame_${Date.now()}.png`);
        const scriptPath = path.join(scriptsDir, "capture-frame-clipboard.ps1");
        const hintArg = projectHint ? ` -ProjectHint "${projectHint.replace(/"/g, '""')}"` : "";
        const sendKeysCombo = toSendKeysCombo(shortcut).replace(/"/g, '""');
        const stdout = execSync(
          `powershell -NoProfile -sta -ExecutionPolicy Bypass -File "${scriptPath}" -OutPath "${outPath}" -SendKeysCombo "${sendKeysCombo}"${hintArg}`,
          { encoding: "utf8" }
        ).trim();

        if (stdout.startsWith("ERROR:") || !fs.existsSync(outPath)) {
          return { content: [{ type: "text", text: stdout || "Frame capture failed (no output file produced)." }], isError: true };
        }

        const imageData = fs.readFileSync(outPath).toString("base64");
        return {
          content: [
            { type: "image", data: imageData, mimeType: "image/png" },
            { type: "text", text: `Saved to ${outPath} (via Copy Frame to Clipboard, shortcut ${shortcut})${prepNote}` }
          ]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error capturing frame: ${String(error)}` }], isError: true };
      }
    }
  );
}
