import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";

// Structural dump of a layer's (or a whole comp's) property tree — name, matchName,
// value, expression, numKeys per node — so the agent doesn't have to spend a handful
// of run-jsx calls just to learn the shape/matchName hierarchy before it can act.
export function registerInspectionTools(server: McpServer) {
  server.tool(
    "get-layer-tree",
    "Get the structural property tree of a layer (name, matchName, value, expression, numKeys per node), " +
    "or of every layer in a composition if layerIndex/layerName is omitted. Use this before writing " +
    "propertyPath arrays for setLayerExpression/setLayerKeyframe on nested properties (shape Contents, " +
    "Essential Properties, etc.) — it shows you the exact names to path through. " +
    "Per-property reads are error-safe: a bad value shows up as 'valueError' on that node, it doesn't fail the call.",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName."),
      layerIndex: z.number().int().positive().optional().describe("1-based index of a single layer to inspect. Omit (with layerName) to dump every layer in the comp."),
      layerName: z.string().optional().describe("Name of a single layer to inspect. Omit (with layerIndex) to dump every layer in the comp."),
      depth: z.number().int().positive().optional().describe("Max property-group nesting depth to descend (default 4 — reaches e.g. Contents > Group > Rect > Size)."),
      maxNodes: z.number().int().positive().optional().describe("Hard cap on total nodes walked before truncating (default 500).")
    },
    async (parameters) => {
      try {
        return await runAndWait("getLayerTree", parameters, 45000);
      } catch (error) {
        return { content: [{ type: "text", text: `Error getting layer tree: ${String(error)}` }], isError: true };
      }
    }
  );
}
