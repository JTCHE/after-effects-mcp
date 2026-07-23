import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";

// Generic escape hatch: run raw ExtendScript or a .jsx file inside After Effects.
// Prefer this over asking for a new bespoke tool — write the JSX inline.
export function registerJsxTools(server: McpServer) {
  server.tool(
    "run-jsx",
    "Execute ExtendScript inside After Effects: either raw code or a .jsx file path. " +
    "This is the general-purpose escape hatch for anything not covered by a dedicated tool " +
    "(e.g. reading/writing keyframe easing, batch operations, querying obscure properties). " +
    "End your code with the expression you want returned — it becomes the JSON 'result'. " +
    "Blocks until After Effects returns the result (or ~45s pass — AE's idle polling loop can " +
    "get silently suspended by the app, so a generous timeout beats a false 'timed out' when the " +
    "script actually finished). " +
    "Long-running scripts block AE's UI thread and the bridge poll loop, so keep individual calls small.",
    {
      code: z.string().optional().describe("Raw ExtendScript source to eval. Provide this or filePath."),
      filePath: z.string().optional().describe("Absolute path to a .jsx file to execute. Provide this or code.")
    },
    async (parameters) => {
      try {
        return await runAndWait("runJsx", parameters, 45000);
      } catch (error) {
        return { content: [{ type: "text", text: `Error running JSX: ${String(error)}` }], isError: true };
      }
    }
  );

  // Lightweight liveness check - doesn't touch the project/comp/layer, so it works even
  // with nothing open, and round-trips through the same poll loop as every other command.
  server.tool(
    "ping",
    "Check whether the MCP Bridge panel is alive and its poll loop is running, without " +
    "touching the After Effects project. Use this instead of a real command when you just " +
    "want to confirm connectivity (e.g. after a timeout, before a batch of calls).",
    {},
    async () => {
      try {
        return await runAndWait("ping", {}, 10000);
      } catch (error) {
        return { content: [{ type: "text", text: `Error pinging bridge: ${String(error)}` }], isError: true };
      }
    }
  );

  // Re-evaluate the bridge .jsx from disk without needing a human to click "Reload Panel".
  // Use this whenever a bridge-side .jsx edit was just deployed to the install path, or when
  // commands are timing out/behaving stale (AE's idle task can wedge; a reload also re-arms it).
  server.tool(
    "reload-bridge",
    "Re-load the MCP Bridge.jsx panel code from disk inside After Effects, without needing the " +
    "user to click 'Reload Panel' by hand. Use this right after deploying an edited bridge script " +
    "to the AE install path, or if bridge commands seem to be running stale/old logic. NOTE: this " +
    "queues through the same poll loop as any other command, so it will NOT recover a fully-stalled " +
    "poller (still-'pending' timeouts) — ask the user to click 'Force Check Now' in the panel instead.",
    {},
    async () => {
      try {
        return await runAndWait("runJsx", { code: "reloadBridge(); JSON.stringify({ status: 'success', reloaded: true });" }, 20000);
      } catch (error) {
        return { content: [{ type: "text", text: `Error reloading bridge: ${String(error)}` }], isError: true };
      }
    }
  );

  // List scripts already installed in AE's Scripts / ScriptUI Panels folders.
  server.tool(
    "list-installed-scripts",
    "List .jsx/.jsxbin scripts installed under the After Effects app folder (Scripts and " +
    "Scripts/ScriptUI Panels), so you know what's already available before writing your own. " +
    ".jsxbin panels are compiled and can't be run via run-jsx — trigger them manually, or " +
    "just write the equivalent JSX yourself via run-jsx.",
    {},
    async () => {
      try {
        return await runAndWait("listInstalledScripts", {});
      } catch (error) {
        return { content: [{ type: "text", text: `Error listing installed scripts: ${String(error)}` }], isError: true };
      }
    }
  );
}
