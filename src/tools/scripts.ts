import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAndWait, readResultsFromTempFile } from "../bridge/client.js";

// Double whitelist with the bridge's command switch — moot in practice since run-jsx
// is a full escape hatch, but kept as-is (see CLAUDE.md "Whitelist model" note).
const ALLOWED_SCRIPTS = [
  "ping",
  "listCompositions",
  "getProjectInfo",
  "getLayerInfo",
  "getLayerTree",
  "duplicateComp",
  "createComposition",
  "createTextLayer",
  "createShapeLayer",
  "createSolidLayer",
  "setLayerProperties",
  "setLayerKeyframe",
  "setLayerExpression",
  "applyEffect",
  "removeEffect",
  "renameEffect",
  "applyEffectTemplate",
  "createCamera",
  "batchSetLayerProperties",
  "setCompositionProperties",
  "duplicateLayer",
  "deleteLayer",
  "setLayerMask",
  "runJsx",
  "listInstalledScripts"
];

export function registerScriptTools(server: McpServer) {
  server.tool(
    "run-script",
    "Run a read-only script in After Effects",
    {
      script: z.string().describe("Name of the predefined script to run"),
      parameters: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the script")
    },
    async ({ script, parameters = {} }) => {
      if (!ALLOWED_SCRIPTS.includes(script)) {
        return {
          content: [
            { type: "text", text: `Error: Script "${script}" is not allowed. Allowed scripts are: ${ALLOWED_SCRIPTS.join(", ")}` }
          ],
          isError: true
        };
      }

      try {
        return await runAndWait(script, parameters);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error running command: ${String(error)}` }],
          isError: true
        };
      }
    }
  );

  // Kept for manual re-checks (e.g. a script that ran long and timed out its tool call);
  // every tool now waits for and returns its own result, so this is no longer required in the golden path.
  server.tool(
    "get-results",
    "Get results from the last script executed in After Effects (rarely needed — tools already return their result directly)",
    {},
    async () => {
      try {
        return { content: [{ type: "text", text: readResultsFromTempFile() }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error getting results: ${String(error)}` }],
          isError: true
        };
      }
    }
  );
}
