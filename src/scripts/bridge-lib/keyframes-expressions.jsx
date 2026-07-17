// Keyframe/expression get-set commands. Depends on resolveComp/resolvePropertyPath/
// resolveLayerAndProperty from utils.jsx.

function setLayerKeyframe(args) {
    try {
        var layerIndex = args.layerIndex, propertyName = args.propertyName,
            timeInSeconds = args.timeInSeconds, value = args.value;
        var comp = resolveComp(args);
        if (!comp) {
            return JSON.stringify({ success: false, message: "Composition not found (pass compName or compIndex, or open a comp)" });
        }
        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var property;
        var propertyLabel;
        if (args.propertyPath && args.propertyPath.length) {
            var resolved = resolvePropertyPath(layer, args.propertyPath);
            if (resolved.error) return JSON.stringify({ success: false, message: resolved.error });
            property = resolved.property;
            propertyLabel = args.propertyPath.join(" > ");
        } else {
            var transformGroup = layer.property("Transform");
            if (!transformGroup) {
                 return JSON.stringify({ success: false, message: "Transform properties not found for layer '" + layer.name + "' (type: " + layer.matchName + ")." });
            }

            property = transformGroup.property(propertyName);
            if (!property) {
                 if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                     property = layer.property("Effects").property(propertyName);
                 } else if (layer.property("Text") && layer.property("Text").property(propertyName)) {
                     property = layer.property("Text").property(propertyName);
                }

                if (!property) {
                     return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
                }
            }
            propertyLabel = propertyName;
        }

        // Ensure the property can be keyframed
        if (!property.canVaryOverTime) {
             return JSON.stringify({ success: false, message: "Property '" + propertyLabel + "' cannot be keyframed." });
        }

        // Make sure the property is enabled for keyframing
        if (property.numKeys === 0 && !property.isTimeVarying) {
             property.setValueAtTime(comp.time, property.value); // Set initial keyframe if none exist
        }

        property.setValueAtTime(timeInSeconds, value);

        return JSON.stringify({ success: true, message: "Keyframe set for '" + propertyLabel + "' on layer '" + layer.name + "' at " + timeInSeconds + "s." });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting keyframe: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

function setLayerExpression(args) {
    try {
        var layerIndex = args.layerIndex, propertyName = args.propertyName,
            expressionString = args.expressionString;
        var comp = resolveComp(args);
         if (!comp) {
            return JSON.stringify({ success: false, message: "Composition not found (pass compName or compIndex, or open a comp)" });
        }
        var layer = comp.layers[layerIndex];
         if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var property;
        var propertyLabel;
        if (args.propertyPath && args.propertyPath.length) {
            var resolved = resolvePropertyPath(layer, args.propertyPath);
            if (resolved.error) return JSON.stringify({ success: false, message: resolved.error });
            property = resolved.property;
            propertyLabel = args.propertyPath.join(" > ");
        } else {
            var transformGroup = layer.property("Transform");

            property = transformGroup ? transformGroup.property(propertyName) : null;
             if (!property) {
                 if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                     property = layer.property("Effects").property(propertyName);
                 } else if (layer.property("Text") && layer.property("Text").property(propertyName)) {
                     property = layer.property("Text").property(propertyName);
                 }

                // Search inside individual effects for sub-properties
                if (!property && layer.property("Effects")) {
                    var effects = layer.property("Effects");
                    for (var ei = 1; ei <= effects.numProperties; ei++) {
                        var eff = effects.property(ei);
                        try {
                            var subProp = eff.property(propertyName);
                            if (subProp) { property = subProp; break; }
                        } catch (e2) {}
                    }
                }

                if (!property) {
                     return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
                }
            }
            propertyLabel = propertyName;
        }

        if (!property.canSetExpression) {
            return JSON.stringify({ success: false, message: "Property '" + propertyLabel + "' does not support expressions." });
        }

        property.expression = expressionString;

        var action = expressionString === "" ? "removed" : "set";
        return JSON.stringify({ success: true, message: "Expression " + action + " for '" + propertyLabel + "' on layer '" + layer.name + "'." });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting expression: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

// Full, untruncated expression text for one property — get-layer-tree truncates long
// expressions for context-efficiency; this is the drill-down when an agent needs the
// whole thing instead of falling back to raw run-jsx.
function getExpression(args) {
    try {
        var r = resolveLayerAndProperty(args);
        if (r.error) return JSON.stringify({ success: false, message: r.error });
        var expr = "";
        try { expr = r.property.expression || ""; } catch (e) {}
        var hasError = false;
        try { hasError = !!r.property.expressionError; } catch (e2) {}
        return JSON.stringify({
            success: true,
            layer: r.layer.name,
            propertyPath: r.propertyLabel,
            expression: expr,
            expressionEnabled: !!r.property.expressionEnabled,
            expressionError: hasError ? r.property.expressionError : null
        });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error reading expression: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

// Batch expression edits in one round trip. Each edit is isolated in its own
// try/catch so one bad propertyPath/expression doesn't abort the rest of the batch
// (feedback: 4 separate setLayerExpression calls for one conceptual edit).
function setExpressions(args) {
    var edits = args.edits || [];
    var results = [];
    for (var i = 0; i < edits.length; i++) {
        var edit = edits[i];
        try {
            var r = resolveLayerAndProperty(edit);
            if (r.error) { results.push({ index: i, success: false, message: r.error }); continue; }
            if (!r.property.canSetExpression) {
                results.push({ index: i, success: false, message: "Property '" + r.propertyLabel + "' does not support expressions." });
                continue;
            }
            r.property.expression = edit.expression || "";
            results.push({ index: i, success: true, layer: r.layer.name, propertyPath: r.propertyLabel });
        } catch (e) {
            results.push({ index: i, success: false, message: "Error setting expression: " + e.toString() + " (Line: " + e.line + ")" });
        }
    }
    return JSON.stringify({ success: results.length > 0 && results.every(function (r) { return r.success; }), results: results });
}

// Evaluate a property's value at a given (or current) time without hand-rolling
// run-jsx for it. No temp-value-then-restore: setValueAtTime on a property with no
// keyframes creates one, so "poke and restore" leaves a stray keyframe behind on
// exactly the properties an agent is most likely to probe. run-jsx remains the
// escape hatch for that workflow.
function evaluateProperty(args) {
    try {
        var r = resolveLayerAndProperty(args);
        if (r.error) return JSON.stringify({ success: false, message: r.error });
        var evalTime = (args.time !== undefined) ? args.time : r.comp.time;
        var value = r.property.valueAtTime(evalTime, false);
        return JSON.stringify({
            success: true,
            layer: r.layer.name,
            propertyPath: r.propertyLabel,
            time: evalTime,
            value: value
        });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error evaluating property: " + e.toString() + " (Line: " + e.line + ")" });
    }
}
