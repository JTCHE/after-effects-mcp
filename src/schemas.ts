// Shared Zod schemas for layer/property identification, reused across tool modules.
import { z } from "zod";

// Legacy identifier shape: mandates layerIndex, allows a bare propertyName shorthand
// (used by the older setLayerKeyframe/setLayerExpression tools).
export const LayerIdentifierSchema = {
  compName: z.string().optional().describe("Name of the target composition (preferred — robust against index shifts). Falls back to compIndex, then the active comp."),
  compIndex: z.number().int().positive().optional().describe("1-based index of the target composition in the project panel. Prefer compName."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};

export const KeyframeValueSchema = z.unknown().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");

// Newer identifier shape shared by the propertyPath-only drill-down tools (getExpression,
// setExpressions, evaluateProperty) — layerName as an alternative to layerIndex, and
// propertyPath is mandatory (no legacy bare-propertyName shorthand for these).
export const CompLayerIdentifierSchema = {
  compName: z.string().optional().describe("Name of the target composition. Falls back to compIndex, then the active comp."),
  compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName."),
  layerIndex: z.number().int().positive().optional().describe("1-based index of the target layer within the composition. Provide this or layerName."),
  layerName: z.string().optional().describe("Name of the target layer within the composition. Provide this or layerIndex.")
};

export const PropertyPathSchema = z.array(z.string()).describe("Path of property names/matchNames to descend from the layer (as seen in get-layer-tree output), e.g. ['Transform','Position'] or ['Contents','Group 1','Rectangle Path 1','Size'].");
