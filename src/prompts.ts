import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  server.prompt(
    "list-compositions",
    "List compositions in the current After Effects project",
    () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Please list all compositions in the current After Effects project."
        }
      }]
    })
  );

  server.prompt(
    "analyze-composition",
    {
      compositionName: z.string().describe("Name of the composition to analyze")
    },
    (args) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the composition named "${args.compositionName}" in the current After Effects project. Provide details about its duration, frame rate, resolution, and layers.`
        }
      }]
    })
  );

  server.prompt(
    "create-composition",
    "Create a new composition with specified settings",
    () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc.`
        }
      }]
    })
  );
}
