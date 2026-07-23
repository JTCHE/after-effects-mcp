import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";
import { LayerIdentifierSchema, KeyframeValueSchema, CompLayerIdentifierSchema, PropertyPathSchema } from "../schemas.js";

export function registerKeyframeExpressionTools(server: McpServer) {
  server.tool(
    "setLayerKeyframe",
    "Set a keyframe for a specific layer property at a given time.",
    {
      ...LayerIdentifierSchema,
      propertyName: z.string().optional().describe("Top-level property name (e.g., 'Position', 'Scale', 'Rotation', 'Opacity'). Sugar for propertyPath: [propertyName]. Provide this or propertyPath."),
      propertyPath: z.array(z.string()).optional().describe("Path of property names/matchNames to descend from the layer, for nested properties (e.g. ['Contents','Group 1','Rectangle Path 1','Size'] or ['Essential Properties','Target Size']). Provide this or propertyName."),
      timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
      value: KeyframeValueSchema
    },
    async (parameters) => {
      try {
        return await runAndWait("setLayerKeyframe", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error setting keyframe: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "getExpression",
    "Read the full, untruncated expression text (plus enabled/error state) for one layer property. " +
    "Use this instead of get-layer-tree's (truncated) dump or raw run-jsx when you need the exact expression string.",
    {
      ...CompLayerIdentifierSchema,
      propertyPath: PropertyPathSchema
    },
    async (parameters) => {
      try {
        return await runAndWait("getExpression", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error getting expression: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "setExpressions",
    "Set or remove expressions on multiple layer properties in one round trip. Each edit is isolated — " +
    "one bad propertyPath/expression is reported per-edit and doesn't abort the rest of the batch. " +
    "Unsure of expression-engine syntax (enums, object methods)? Check search-ae-docs (scope: 'expressions') " +
    "first — cheaper than iterating on getExpression's error text.",
    {
      edits: z.array(z.object({
        ...CompLayerIdentifierSchema,
        propertyPath: PropertyPathSchema,
        expression: z.string().describe("The JavaScript expression string. Empty string (\"\") removes the expression.")
      })).describe("List of edits to apply. Each entry independently identifies its own comp/layer/property.")
    },
    async (parameters) => {
      try {
        return await runAndWait("setExpressions", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error setting expressions: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "evaluateProperty",
    "Evaluate a layer property's value without hand-rolling run-jsx. Optionally evaluate at a specific " +
    "time (defaults to the comp's current time). For temporarily poking a value in to check derived " +
    "math and restoring it after, use run-jsx directly — setting a value on an un-keyframed property " +
    "creates a keyframe, so a generic poke-and-restore here would leave stray keyframes behind.",
    {
      ...CompLayerIdentifierSchema,
      propertyPath: PropertyPathSchema,
      time: z.number().optional().describe("Time in seconds to evaluate at. Defaults to the comp's current time.")
    },
    async (parameters) => {
      try {
        return await runAndWait("evaluateProperty", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error evaluating property: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "setLayerExpression",
    "Set or remove an expression for a specific layer property. Unsure of expression-engine syntax? Check " +
    "search-ae-docs (scope: 'expressions') first — cheaper than iterating on getExpression's error text.",
    {
      ...LayerIdentifierSchema,
      propertyName: z.string().optional().describe("Top-level property name (e.g., 'Position', 'Scale', 'Rotation', 'Opacity'). Sugar for propertyPath: [propertyName]. Provide this or propertyPath."),
      propertyPath: z.array(z.string()).optional().describe("Path of property names/matchNames to descend from the layer, for nested properties (e.g. ['Contents','Group 1','Rectangle Path 1','Size'] or ['Essential Properties','Target Size']). Provide this or propertyName."),
      expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression. Prefer descriptive variable names (sourceLayer, startTime, targetPos) over single-letter names (n, t, p) — the expression may be read/edited by a human later.")
    },
    async (parameters) => {
      try {
        return await runAndWait("setLayerExpression", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error setting expression: ${String(error)}` }], isError: true };
      }
    }
  );
}
