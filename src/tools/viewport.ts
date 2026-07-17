import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";

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
      fitToView: z.boolean().optional().describe("Zoom the comp viewer to fit and restore afterward (default true). Set false to capture whatever pan/zoom is currently on screen.")
    },
    async ({ maxWidth = 1600, compName, compIndex, fitToView = true }) => {
      if (process.platform !== "win32") {
        return {
          content: [{ type: "text", text: "get-viewport-screenshot is Windows-only." }],
          isError: true
        };
      }
      let savedZoom: number | null = null;
      let fitNote = "";
      if (fitToView) {
        try {
          const prep = await runAndWait("prepareViewportCapture", { compName, compIndex }, 15000);
          const prepText = prep.content[0]?.text ?? "";
          const parsed = JSON.parse(prepText);
          if (parsed.status === "success") {
            savedZoom = parsed.savedZoom ?? null;
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
        const stdout = execSync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -OutPath "${outPath}" -MaxWidth ${maxWidth}`,
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
}
