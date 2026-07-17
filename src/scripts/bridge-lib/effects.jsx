// Effect apply/remove/rename/enable/template commands, plus getEffectPropertiesByMatchName
// (matchName lookup via a throwaway scratch solid) and the bridgeTestEffects smoke test.
// Depends on resolveComp/listEffectProperties from utils.jsx.

// --- applyEffect (from applyEffect.jsx) ---
function applyEffect(args) {
    try {
        var layerIndex = args.layerIndex || 1; // Default to first layer
        var effectName = args.effectName; // Name of the effect to apply
        var effectMatchName = args.effectMatchName; // After Effects internal name (more reliable)
        var effectCategory = args.effectCategory || ""; // Optional category for filtering
        var presetPath = args.presetPath; // Optional path to an effect preset
        var effectSettings = args.effectSettings || {}; // Optional effect parameters

        if (!effectName && !effectMatchName && !presetPath) {
            throw new Error("You must specify either effectName, effectMatchName, or presetPath");
        }

        var comp = resolveComp(args);
        if (!comp) {
            throw new Error("Composition not found (pass compName or compIndex, or open a comp)");
        }

        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }

        var effectResult;

        if (presetPath) {
            var presetFile = new File(presetPath);
            if (!presetFile.exists) {
                throw new Error("Effect preset file not found: " + presetPath);
            }

            layer.applyPreset(presetFile);
            effectResult = {
                type: "preset",
                name: presetPath.split('/').pop().split('\\').pop(),
                applied: true
            };
        }
        else if (effectMatchName) {
            var effect = layer.Effects.addProperty(effectMatchName);
            applyEffectSettings(effect, effectSettings);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex,
                properties: listEffectProperties(effect)
            };
        }
        else {
            var effect = layer.Effects.addProperty(effectName);
            applyEffectSettings(effect, effectSettings);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex,
                properties: listEffectProperties(effect)
            };
        }

        return JSON.stringify({
            status: "success",
            message: "Effect applied successfully",
            effect: effectResult,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                id: comp.id
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// Remove an effect from a layer, identified by effectName, effectMatchName, or
// 1-based effectIndex (within the layer's effect stack).
function removeEffect(args) {
    try {
        var layerIndex = args.layerIndex || 1;
        var comp = resolveComp(args);
        if (!comp) throw new Error("Composition not found (pass compName or compIndex, or open a comp)");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");

        var effects = layer.property("ADBE Effect Parade");
        if (!effects || effects.numProperties === 0) throw new Error("Layer '" + layer.name + "' has no effects");

        var target = null;
        if (args.effectIndex) {
            target = effects.property(args.effectIndex);
        } else if (args.effectMatchName) {
            for (var i = 1; i <= effects.numProperties; i++) {
                if (effects.property(i).matchName === args.effectMatchName) { target = effects.property(i); break; }
            }
        } else if (args.effectName) {
            for (var j = 1; j <= effects.numProperties; j++) {
                if (effects.property(j).name === args.effectName) { target = effects.property(j); break; }
            }
        } else {
            throw new Error("Specify effectName, effectMatchName, or effectIndex");
        }
        if (!target) throw new Error("Effect not found on layer '" + layer.name + "'");

        var removed = target.name;
        app.beginUndoGroup("Remove effect");
        target.remove();
        app.endUndoGroup();

        var remaining = [];
        for (var k = 1; k <= effects.numProperties; k++) remaining.push(effects.property(k).name);
        return JSON.stringify({
            status: "success",
            message: "Removed effect '" + removed + "' from '" + layer.name + "'",
            layer: { name: layer.name, index: layerIndex },
            composition: { name: comp.name, id: comp.id },
            remainingEffects: remaining
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() }, null, 2);
    }
}

function renameEffect(args) {
    try {
        var comp = resolveComp(args);
        if (!comp) throw new Error("Composition not found");
        var layer = comp.layer(args.layerIndex || 1);
        if (!layer) throw new Error("Layer not found");
        var effects = layer.property("ADBE Effect Parade");
        var target = null;
        if (args.effectIndex) {
            target = effects.property(args.effectIndex);
        } else if (args.effectName) {
            for (var i = 1; i <= effects.numProperties; i++) {
                if (effects.property(i).name === args.effectName) { target = effects.property(i); break; }
            }
        } else if (args.effectMatchName) {
            for (var j = 1; j <= effects.numProperties; j++) {
                if (effects.property(j).matchName === args.effectMatchName) { target = effects.property(j); break; }
            }
        }
        if (!target) throw new Error("Effect not found");
        if (!args.newName) throw new Error("newName is required");
        app.beginUndoGroup("Rename effect");
        target.name = args.newName;
        app.endUndoGroup();
        return JSON.stringify({ status: "success", message: "Renamed effect to '" + target.name + "'", composition: { name: comp.name, id: comp.id } });
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() });
    }
}

function setEffectEnabled(args) {
    try {
        var comp = resolveComp(args);
        if (!comp) throw new Error("Composition not found (pass compName or compIndex, or open a comp)");
        var layer = comp.layer(args.layerIndex || 1);
        if (!layer) throw new Error("Layer not found");
        var effects = layer.property("ADBE Effect Parade");
        if (!effects || effects.numProperties === 0) throw new Error("Layer '" + layer.name + "' has no effects");

        var target = null;
        if (args.effectIndex) {
            target = effects.property(args.effectIndex);
        } else if (args.effectMatchName) {
            for (var i = 1; i <= effects.numProperties; i++) {
                if (effects.property(i).matchName === args.effectMatchName) { target = effects.property(i); break; }
            }
        } else if (args.effectName) {
            for (var j = 1; j <= effects.numProperties; j++) {
                if (effects.property(j).name === args.effectName) { target = effects.property(j); break; }
            }
        } else {
            throw new Error("Specify effectName, effectMatchName, or effectIndex");
        }
        if (!target) throw new Error("Effect not found on layer '" + layer.name + "'");
        if (args.enabled === undefined) throw new Error("enabled (true/false) is required");

        app.beginUndoGroup("Toggle effect enabled");
        target.enabled = !!args.enabled;
        app.endUndoGroup();

        return JSON.stringify({
            status: "success",
            message: (target.enabled ? "Enabled" : "Disabled") + " effect '" + target.name + "' on '" + layer.name + "'",
            layer: { name: layer.name, index: args.layerIndex || 1 },
            effect: { name: target.name, enabled: target.enabled },
            composition: { name: comp.name, id: comp.id }
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() }, null, 2);
    }
}

// Helper function to apply effect settings
function applyEffectSettings(effect, settings) {
    if (!settings) return;
    var hasKeys = false;
    for (var k in settings) { if (settings.hasOwnProperty(k)) { hasKeys = true; break; } }
    if (!hasKeys) return;

    for (var propName in settings) {
        if (settings.hasOwnProperty(propName)) {
            try {
                var property = null;

                try {
                    property = effect.property(propName);
                } catch (e) {
                    for (var i = 1; i <= effect.numProperties; i++) {
                        var prop = effect.property(i);
                        if (prop.name === propName) {
                            property = prop;
                            break;
                        }
                    }
                }

                // Set the property. An object value { parameters, value } lets the caller
                // set a Dropdown Menu Control's items via setPropertyParameters and/or a
                // default value; a plain value is set directly.
                var val = settings[propName];
                if (property && val && typeof val === "object" && !(val instanceof Array) &&
                    (val.parameters !== undefined || val.value !== undefined)) {
                    if (val.parameters && property.setPropertyParameters) {
                        property.setPropertyParameters(val.parameters);
                    }
                    if (val.value !== undefined && property.setValue) {
                        property.setValue(val.value);
                    }
                } else if (property && property.setValue) {
                    property.setValue(val);
                }
            } catch (e) {
                $.writeln("Error setting effect property '" + propName + "': " + e.toString());
            }
        }
    }
}

// --- applyEffectTemplate (from applyEffectTemplate.jsx) ---
function applyEffectTemplate(args) {
    try {
        var layerIndex = args.layerIndex || 1; // Default to first layer
        var templateName = args.templateName; // Name of the template to apply
        var customSettings = args.customSettings || {}; // Optional customizations

        if (!templateName) {
            throw new Error("You must specify a templateName");
        }

        var comp = resolveComp(args);
        if (!comp) {
            throw new Error("Composition not found (pass compName or compIndex, or open a comp)");
        }

        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }

        // Template definitions
        var templates = {
            // Blur effects
            "gaussian-blur": {
                effectMatchName: "ADBE Gaussian Blur 2",
                settings: {
                    "Blurriness": customSettings.blurriness || 20
                }
            },
            "directional-blur": {
                effectMatchName: "ADBE Directional Blur",
                settings: {
                    "Direction": customSettings.direction || 0,
                    "Blur Length": customSettings.length || 10
                }
            },

            // Color correction effects
            "color-balance": {
                effectMatchName: "ADBE Color Balance (HLS)",
                settings: {
                    "Hue": customSettings.hue || 0,
                    "Lightness": customSettings.lightness || 0,
                    "Saturation": customSettings.saturation || 0
                }
            },
            "brightness-contrast": {
                effectMatchName: "ADBE Brightness & Contrast 2",
                settings: {
                    "Brightness": customSettings.brightness || 0,
                    "Contrast": customSettings.contrast || 0,
                    "Use Legacy": false
                }
            },
            "curves": {
                effectMatchName: "ADBE CurvesCustom"
                // Curves are complex and would need special handling
            },

            // Stylistic effects
            "glow": {
                effectMatchName: "ADBE Glow",
                settings: {
                    "Glow Threshold": customSettings.threshold || 50,
                    "Glow Radius": customSettings.radius || 15,
                    "Glow Intensity": customSettings.intensity || 1
                }
            },
            "drop-shadow": {
                effectMatchName: "ADBE Drop Shadow",
                settings: {
                    "Shadow Color": customSettings.color || [0, 0, 0, 1],
                    "Opacity": customSettings.opacity || 50,
                    "Direction": customSettings.direction || 135,
                    "Distance": customSettings.distance || 10,
                    "Softness": customSettings.softness || 10
                }
            },

            // Common effect chains
            "cinematic-look": {
                effects: [
                    {
                        effectMatchName: "ADBE CurvesCustom",
                        settings: {}
                    },
                    {
                        effectMatchName: "ADBE Vibrance",
                        settings: {
                            "Vibrance": 15,
                            "Saturation": -5
                        }
                    }
                ]
            },
            "text-pop": {
                effects: [
                    {
                        effectMatchName: "ADBE Drop Shadow",
                        settings: {
                            "Shadow Color": [0, 0, 0, 1],
                            "Opacity": 75,
                            "Distance": 5,
                            "Softness": 10
                        }
                    },
                    {
                        effectMatchName: "ADBE Glow",
                        settings: {
                            "Glow Threshold": 50,
                            "Glow Radius": 10,
                            "Glow Intensity": 1.5
                        }
                    }
                ]
            }
        };

        var template = templates[templateName];
        if (!template) {
            // No Object.keys in ExtendScript's ES3 engine.
            var availableTemplates = [];
            for (var templateKey in templates) {
                if (templates.hasOwnProperty(templateKey)) availableTemplates.push(templateKey);
            }
            throw new Error("Template '" + templateName + "' not found. Available templates: " + availableTemplates.join(", "));
        }

        var appliedEffects = [];

        if (template.effectMatchName) {
            var effect = layer.Effects.addProperty(template.effectMatchName);

            for (var propName in template.settings) {
                try {
                    var property = effect.property(propName);
                    if (property) {
                        property.setValue(template.settings[propName]);
                    }
                } catch (e) {
                    $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                }
            }

            appliedEffects.push({
                name: effect.name,
                matchName: effect.matchName
            });
        } else if (template.effects) {
            for (var i = 0; i < template.effects.length; i++) {
                var effectData = template.effects[i];
                var effect = layer.Effects.addProperty(effectData.effectMatchName);

                for (var propName in effectData.settings) {
                    try {
                        var property = effect.property(propName);
                        if (property) {
                            property.setValue(effectData.settings[propName]);
                        }
                    } catch (e) {
                        $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                    }
                }

                appliedEffects.push({
                    name: effect.name,
                    matchName: effect.matchName
                });
            }
        }

        return JSON.stringify({
            status: "success",
            message: "Effect template '" + templateName + "' applied successfully",
            appliedEffects: appliedEffects,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                id: comp.id
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// List an effect's properties (name/matchName/index/type/expected value shape) by
// matchName alone — no layer needs to carry the effect already. Applies it to a
// scratch solid created (and removed) within this call, so it's a one-shot lookup
// instead of the "apply, dump, guess again, remove" round-trip agents were doing.
// Wrapped in an undo group so any mid-flight failure is one Ctrl+Z away.
function getEffectPropertiesByMatchName(args) {
    var matchName = args.matchName, effectName = args.effectName;
    if (!matchName && !effectName) return JSON.stringify({ success: false, message: "Pass matchName (preferred) or effectName." });
    var comp = resolveComp(args);
    if (!comp) return JSON.stringify({ success: false, message: "Composition not found (pass compName or compIndex, or open a comp)." });
    var scratchLayer = null;
    app.beginUndoGroup("MCP effect inspect");
    try {
        scratchLayer = comp.layers.addSolid([0, 0, 0], "__mcp_scratch__", comp.width, comp.height, 1, 0.1);
        var effect = scratchLayer.Effects.addProperty(matchName || effectName);
        var props = listEffectProperties(effect);
        return JSON.stringify({
            success: true,
            name: effect.name,
            matchName: effect.matchName,
            properties: props
        });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error inspecting effect '" + (matchName || effectName) + "': " + e.toString() + " (Line: " + e.line + ")" });
    } finally {
        // addSolid creates a Solids-folder project item in addition to the layer;
        // removing only the layer leaves that source item orphaned permanently.
        if (scratchLayer) {
            try {
                var src = scratchLayer.source;
                scratchLayer.remove();
                if (src) src.remove();
            } catch (eRm) {}
        }
        app.endUndoGroup();
    }
}

// --- Bridge test function to verify communication and effects application ---
function bridgeTestEffects(args) {
    try {
        var compIndex = (args && args.compIndex) ? args.compIndex : 1;
        var layerIndex = (args && args.layerIndex) ? args.layerIndex : 1;

        var blurRes = JSON.parse(applyEffect({
            compIndex: compIndex,
            layerIndex: layerIndex,
            effectMatchName: "ADBE Gaussian Blur 2",
            effectSettings: { "Blurriness": 5 }
        }));

        var shadowRes = JSON.parse(applyEffectTemplate({
            compIndex: compIndex,
            layerIndex: layerIndex,
            templateName: "drop-shadow"
        }));

        return JSON.stringify({
            status: "success",
            message: "Bridge test effects applied.",
            results: [blurRes, shadowRes]
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() }, null, 2);
    }
}
