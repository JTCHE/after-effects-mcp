import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAndWait } from "../bridge/client.js";

export function registerEffectsTools(server: McpServer) {
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

  server.tool(
    "run-bridge-test",
    "Run the bridge test effects script to verify communication and apply test effects",
    {},
    async () => {
      try {
        return await runAndWait("bridgeTestEffects", {});
      } catch (error) {
        return { content: [{ type: "text", text: `Error running bridge test: ${String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "mcp_aftereffects_get_effects_help",
    "Get help on using After Effects effects",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
`
        }
      ]
    })
  );
}
