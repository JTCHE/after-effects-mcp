import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clearResultsFile, waitForBridgeResult, writeCommandFile } from "./bridge/client.js";

export function registerResources(server: McpServer) {
  server.resource(
    "compositions",
    "aftereffects://compositions",
    async (uri) => {
      clearResultsFile();
      writeCommandFile("listCompositions", {});
      const result = await waitForBridgeResult("listCompositions", 6000, 250);

      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: result
        }]
      };
    }
  );
}
