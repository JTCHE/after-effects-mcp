import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";

export function registerEffectsTools(server: McpServer) {
  server.tool(
    "list-effects",
    "List the effects already on a layer (name, matchName, stack index, enabled) without dumping the " +
    "full property tree. Use this to check whether a layer already has effect X before applying it.",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
    },
    async (parameters) => {
      try {
        return await runAndWait("listLayerEffects", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error listing effects: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "apply-effect",
    "Apply an effect to a layer in After Effects",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred — robust against index shifts). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition in the project panel. Prefer compName."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
      effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
      effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
      effectCategory: z.string().optional().describe("Optional category for filtering effects."),
      presetPath: z.string().optional().describe("Optional path to an effect preset file (.ffx)."),
      effectSettings: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
    },
    async (parameters) => {
      try {
        return await runAndWait("applyEffect", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error applying effect: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "getLayerEffectProperties",
    "List the properties of an effect already applied to a layer — flat, with unambiguous 1-based index and " +
    "matchName per property, plus its current value. Use the returned index or matchName (not the display name) " +
    "to address a specific property in run-jsx/expressions: some effects have multiple properties sharing a " +
    "display name (e.g. Grid's own 'Width' vs. a Feather sub-group's 'Width'), and effect(\"Name\") lookups " +
    "silently grab whichever matches first.",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
      effectName: z.string().optional().describe("Display name of the effect (e.g., 'Grid')."),
      effectMatchName: z.string().optional().describe("Internal match name of the effect (e.g., 'ADBE Grid')."),
      effectIndex: z.number().int().positive().optional().describe("1-based index of the effect within the layer's effect stack (from list-effects). Preferred — unambiguous.")
    },
    async (parameters) => {
      try {
        return await runAndWait("getLayerEffectProperties", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error listing effect properties: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "remove-effect",
    "Remove an effect from a layer in After Effects, identified by name, matchName, or stack index.",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
      effectName: z.string().optional().describe("Display name of the effect to remove (e.g., 'Slider Control')."),
      effectMatchName: z.string().optional().describe("Internal match name of the effect (e.g., 'ADBE Slider Control')."),
      effectIndex: z.number().int().positive().optional().describe("1-based index of the effect within the layer's effect stack.")
    },
    async (parameters) => {
      try {
        return await runAndWait("removeEffect", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error removing effect: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "rename-effect",
    "Rename an effect on a layer in After Effects.",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
      effectName: z.string().optional().describe("Current display name of the effect."),
      effectMatchName: z.string().optional().describe("Internal match name of the effect."),
      effectIndex: z.number().int().positive().optional().describe("1-based stack index of the effect."),
      newName: z.string().describe("New display name to assign to the effect.")
    },
    async (parameters) => {
      try {
        return await runAndWait("renameEffect", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "set-effect-enabled",
    "Enable or disable (toggle the fx checkbox for) an effect on a layer in After Effects, identified by name, matchName, or stack index.",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition. Prefer compName."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
      effectName: z.string().optional().describe("Display name of the effect (e.g., 'Gaussian Blur')."),
      effectMatchName: z.string().optional().describe("Internal match name of the effect (e.g., 'ADBE Gaussian Blur 2')."),
      effectIndex: z.number().int().positive().optional().describe("1-based index of the effect within the layer's effect stack."),
      enabled: z.boolean().describe("true to enable the effect, false to disable it.")
    },
    async (parameters) => {
      try {
        return await runAndWait("setEffectEnabled", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error setting effect enabled state: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "apply-effect-template",
    "Apply a predefined effect template to a layer in After Effects",
    {
      compName: z.string().optional().describe("Name of the target composition (preferred — robust against index shifts). Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the target composition in the project panel. Prefer compName."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
      templateName: z.enum([
        "gaussian-blur",
        "directional-blur",
        "color-balance",
        "brightness-contrast",
        "curves",
        "glow",
        "drop-shadow",
        "cinematic-look",
        "text-pop"
      ]).describe("Name of the effect template to apply."),
      customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
    },
    async (parameters) => {
      try {
        return await runAndWait("applyEffectTemplate", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error applying effect template: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "getEffectPropertiesByMatchName",
    "Look up an effect's property list (name/matchName/index/value type) by matchName or display name, " +
    "without needing a layer that already carries it — applies the effect to a throwaway scratch solid " +
    "(removed before returning) purely to enumerate its properties. Kills the matchName-guessing-game " +
    "round trip of apply/dump/remove/re-apply.",
    {
      matchName: z.string().optional().describe("Effect matchName (e.g. 'ADBE Grid'). Preferred — unambiguous."),
      effectName: z.string().optional().describe("Effect display name (e.g. 'Grid'). Provide this or matchName."),
      compName: z.string().optional().describe("Composition to create the scratch layer in. Falls back to compIndex, then the active comp."),
      compIndex: z.number().int().positive().optional().describe("1-based index of the composition. Prefer compName.")
    },
    async (parameters) => {
      try {
        return await runAndWait("getEffectPropertiesByMatchName", parameters);
      } catch (error) {
        return { content: [{ type: "text", text: `Error inspecting effect: ${String(error)}` }], isError: true };
      }
    }
  );

}
