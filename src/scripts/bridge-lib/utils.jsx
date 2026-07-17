// Shared lookup/serialization helpers used across the other bridge-lib modules.

// Resolve a composition from args by name (preferred, robust across index shifts),
// then 1-based project index, then the active comp. Returns null if none match.
function resolveComp(args) {
    args = args || {};
    if (args.compName) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === args.compName) return it;
        }
    }
    if (args.compIndex) {
        var byIdx = app.project.item(args.compIndex);
        if (byIdx instanceof CompItem) return byIdx;
    }
    if (app.project.activeItem instanceof CompItem) return app.project.activeItem;
    return null;
}

// Ambient "where are we" snapshot attached to every result, so the agent never has to
// guess whether app.project.activeItem was actually the comp it meant (it's null whenever
// a non-Composition panel, e.g. Effect Controls, has focus).
function getAmbientContext() {
    try {
        var ctx = { activeComp: null, time: null, selectedLayers: [] };
        if (app.project.activeItem instanceof CompItem) {
            var comp = app.project.activeItem;
            ctx.activeComp = comp.name;
            ctx.time = comp.time;
            var sel = comp.selectedLayers;
            for (var i = 0; i < sel.length; i++) ctx.selectedLayers.push(sel[i].name);
        }
        return ctx;
    } catch (e) {
        return { activeComp: null, time: null, selectedLayers: [] };
    }
}

// Walk a property path (e.g. ["Contents","Group 1","Rectangle Path 1","Size"] or
// ["Essential Properties","Target Size"]) starting from a layer, matching each segment
// by display name first, then matchName (agents read both off get-layer-tree output).
// On a dead end, the error names where it failed and what children WERE available, so
// a wrong guess is a one-retry fix instead of a stare-at-raw-JSX session.
function resolvePropertyPath(layer, pathArr) {
    var current = layer;
    for (var i = 0; i < pathArr.length; i++) {
        var seg = pathArr[i];
        var next = null;
        try { next = current.property(seg); } catch (e) { next = null; }
        if (!next) {
            for (var j = 1; j <= current.numProperties; j++) {
                var child = current.property(j);
                var childMatchName = null;
                try { childMatchName = child.matchName; } catch (e2) {}
                if (childMatchName === seg) { next = child; break; }
            }
        }
        if (!next) {
            var avail = [];
            for (var k = 1; k <= current.numProperties; k++) {
                try { avail.push(current.property(k).name); } catch (e3) {}
            }
            return { error: "'" + seg + "' not found under '" + (current.name || "layer") + "'. Children: [" + avail.join(", ") + "]" };
        }
        current = next;
    }
    return { property: current };
}

// Shared by getExpression/setExpressions/evaluateProperty: resolve comp -> layer ->
// property from a propertyPath, in one place instead of the transform/effects/text
// fallback maze duplicated in setLayerKeyframe/setLayerExpression. New tools require
// propertyPath (as returned by get-layer-tree) rather than re-supporting the old bare-
// propertyName shorthand.
function resolveLayerAndProperty(args) {
    var comp = resolveComp(args);
    if (!comp) return { error: "Composition not found (pass compName or compIndex, or open a comp)." };
    var layer = (args.layerIndex != null) ? comp.layers[args.layerIndex] : null;
    if (!layer && args.layerName) layer = comp.layers.byName(args.layerName);
    if (!layer) return { error: "Layer not found (pass layerIndex or layerName) in composition '" + comp.name + "'." };
    if (!args.propertyPath || !args.propertyPath.length) return { error: "propertyPath is required (array of property names/matchNames, as seen in get-layer-tree output)." };
    var resolved = resolvePropertyPath(layer, args.propertyPath);
    if (resolved.error) return { error: resolved.error };
    return { comp: comp, layer: layer, property: resolved.property, propertyLabel: args.propertyPath.join(" > ") };
}

// Human-readable name for a PropertyValueType (so the agent knows what shape a
// value is: color = 4-array, TwoD = 2-array, OneD = scalar, etc.).
function valueTypeName(t) {
    if (t === PropertyValueType.COLOR) return "COLOR";
    if (t === PropertyValueType.ThreeD || t === PropertyValueType.ThreeD_SPATIAL) return "ThreeD";
    if (t === PropertyValueType.TwoD || t === PropertyValueType.TwoD_SPATIAL) return "TwoD";
    if (t === PropertyValueType.OneD) return "OneD";
    if (t === PropertyValueType.LAYER_INDEX) return "LAYER_INDEX";
    if (t === PropertyValueType.MASK_INDEX) return "MASK_INDEX";
    if (t === PropertyValueType.TEXT_DOCUMENT) return "TEXT_DOCUMENT";
    if (t === PropertyValueType.SHAPE) return "SHAPE";
    if (t === PropertyValueType.CUSTOM_VALUE) return "CUSTOM_VALUE";
    if (t === PropertyValueType.MARKER) return "MARKER";
    if (t === PropertyValueType.NO_VALUE) return "NO_VALUE";
    return "" + t;
}

// List an effect's top-level properties so the agent can both SEE and set them:
// name + matchName, the current value, and its value type.
function listEffectProperties(effect) {
    var out = [];
    for (var i = 1; i <= effect.numProperties; i++) {
        var p = effect.property(i);
        var info = { index: i, name: p.name };
        try { info.matchName = p.matchName; } catch (e) {}
        try {
            if (p.propertyType === PropertyType.PROPERTY) {
                info.valueType = valueTypeName(p.propertyValueType);
                info.canSetExpression = p.canSetExpression;
                try { info.value = p.value; } catch (eV) {}
            } else {
                info.group = true;
            }
        } catch (e) {}
        out.push(info);
    }
    return out;
}

// Recursively collect any property that carries a non-empty expression.
function collectExpressions(propGroup, path, out) {
    for (var i = 1; i <= propGroup.numProperties; i++) {
        var p = propGroup.property(i);
        var name = (path ? path + " > " : "") + p.name;
        if (p.propertyType === PropertyType.PROPERTY) {
            if (p.canSetExpression && p.expressionEnabled && p.expression && p.expression !== "") {
                out.push({ prop: name, expression: p.expression });
            }
        } else if (p.numProperties > 0) {
            collectExpressions(p, name, out);
        }
    }
}

// ExtendScript's Date has no toISOString (ES3 engine) — build it manually.
function toISOStringCompat(d) {
    function pad(n, len) { n = String(n); while (n.length < (len || 2)) n = "0" + n; return n; }
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
        "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) +
        "." + pad(d.getUTCMilliseconds(), 3) + "Z";
}
