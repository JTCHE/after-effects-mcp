import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as path from "path";
import { fileURLToPath } from 'url';

import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { registerScriptTools } from "./tools/scripts.js";
import { registerCompositionTools } from "./tools/composition.js";
import { registerKeyframeExpressionTools } from "./tools/keyframes-expressions.js";
import { registerEffectsTools } from "./tools/effects.js";
import { registerJsxTools } from "./tools/jsx.js";
import { registerInspectionTools } from "./tools/inspection.js";
import { registerViewportTools } from "./tools/viewport.js";
import { registerHelpTools } from "./tools/help.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = path.join(__dirname, "scripts");

const server = new McpServer({
  name: "AfterEffectsServer",
  version: "1.0.0"
});

registerResources(server);
registerPrompts(server);
registerScriptTools(server);
registerCompositionTools(server);
registerKeyframeExpressionTools(server);
registerEffectsTools(server);
registerJsxTools(server);
registerInspectionTools(server);
registerViewportTools(server, SCRIPTS_DIR);
registerHelpTools(server);

async function main() {
  console.error("After Effects MCP Server starting...");
  console.error(`Scripts directory: ${SCRIPTS_DIR}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("After Effects MCP Server running...");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
