import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";

export function registerCompositionTools(server: McpServer) {
  server.tool(
    "get-composition-info",
    "Get a composition's dimensions, frameRate, duration, pixelAspect, bgColor, current time and layer " +
    "count in one call — folds what would otherwise need a separate run-jsx call (e.g. just for bgColor) " +
    "into the same round trip.",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName.")
    },
    async (parameters) => {
      try {
        return await runAndWait("getCompositionInfo", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error getting composition info: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "create-composition",
    "Create a new composition in After Effects with specified parameters",
    {
      name: z.string().describe("Name of the composition"),
      width: z.number().int().positive().describe("Width of the composition in pixels"),
      height: z.number().int().positive().describe("Height of the composition in pixels"),
      pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default: 1.0)"),
      duration: z.number().positive().optional().describe("Duration in seconds (default: 10.0)"),
      frameRate: z.number().positive().optional().describe("Frame rate in frames per second (default: 30.0)"),
      backgroundColor: z.object({
        r: z.number().int().min(0).max(255),
        g: z.number().int().min(0).max(255),
        b: z.number().int().min(0).max(255)
      }).optional().describe("Background color of the composition (RGB values 0-255)")
    },
    async (params) => {
      try {
        return await runAndWait("createComposition", params);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error creating composition: ${String(error)}` }],
          isError: true
        };
      }
    }
  );
}
