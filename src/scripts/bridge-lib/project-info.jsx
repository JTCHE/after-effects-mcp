// Read-only project/comp/layer inspection commands, plus comp-level mutations
// (duplicateComp, setCompositionProperties) that don't touch layer content.

function getProjectInfo() {
    var project = app.project;
    var result = {
        projectName: project.file ? project.file.name : "Untitled Project",
        path: project.file ? project.file.fsName : "",
        numItems: project.numItems,
        bitsPerChannel: project.bitsPerChannel,
        timeMode: project.timeDisplayType === TimeDisplayType.FRAMES ? "Frames" : "Timecode",
        items: []
    };

    var countByType = {
        compositions: 0,
        footage: 0,
        folders: 0,
        solids: 0
    };

    for (var i = 1; i <= Math.min(project.numItems, 50); i++) {
        var item = project.item(i);
        var itemType = "";

        if (item instanceof CompItem) {
            itemType = "Composition";
            countByType.compositions++;
        } else if (item instanceof FolderItem) {
            itemType = "Folder";
            countByType.folders++;
        } else if (item instanceof FootageItem) {
            if (item.mainSource instanceof SolidSource) {
                itemType = "Solid";
                countByType.solids++;
            } else {
                itemType = "Footage";
                countByType.footage++;
            }
        }

        result.items.push({
            id: item.id,
            name: item.name,
            type: itemType
        });
    }

    result.itemCounts = countByType;

    if (app.project.activeItem instanceof CompItem) {
        var ac = app.project.activeItem;
        result.activeComp = {
            id: ac.id,
            name: ac.name,
            width: ac.width,
            height: ac.height,
            duration: ac.duration,
            frameRate: ac.frameRate,
            numLayers: ac.numLayers
        };
    }

    return JSON.stringify(result, null, 2);
}

function listCompositions() {
    var project = app.project;
    var result = {
        compositions: []
    };

    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);

        if (item instanceof CompItem) {
            result.compositions.push({
                id: item.id,
                name: item.name,
                duration: item.duration,
                frameRate: item.frameRate,
                width: item.width,
                height: item.height,
                numLayers: item.numLayers
            });
        }
    }

    return JSON.stringify(result, null, 2);
}

function getLayerInfo(args) {
    args = args || {};
    // Accept compName/compIndex (general) or the legacy compositionName; else active comp.
    if (args.compositionName && !args.compName) args.compName = args.compositionName;
    var comp = resolveComp(args);
    if (!comp) return JSON.stringify({ error: "Comp not found (pass compName/compIndex or open a comp)" }, null, 2);

    var result = { comp: comp.name, layers: [] };

    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        var exprs = [];
        try { collectExpressions(layer, "", exprs); } catch (e) {}
        result.layers.push({
            index: layer.index,
            name: layer.name,
            enabled: layer.enabled,
            parent: layer.parent ? layer.parent.name : null,
            threeDLayer: layer.threeDLayer,
            position: layer.property("Position").value,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            expressions: exprs
        });
    }

    return JSON.stringify(result, null, 2);
}

// Structural property-tree dump for one layer (or every layer in a comp, if none named).
// Replaces the "8 run-jsx calls just to see the shape hierarchy" pattern. Per-property
// try/catch: a bad read (e.g. a shape Rect prop mid-eval throwing "divide by zero")
// becomes a "valueError" string on that one node instead of failing the whole call.
function getLayerTree(args) {
    args = args || {};
    var comp = resolveComp(args);
    if (!comp) return JSON.stringify({ status: "error", message: "Composition not found (pass compName or compIndex, or open a comp)" });

    var maxDepth = args.depth || 4;
    var maxNodes = args.maxNodes || 500;
    var counter = { count: 0, truncated: false };

    function safeValue(prop) {
        try {
            var v = prop.valueAtTime(comp.time, false);
            try { JSON.stringify(v); return { value: v }; }
            catch (serErr) { return { value: String(v) }; }
        } catch (e) {
            return { valueError: e.toString() };
        }
    }

    function walkProp(prop, depth) {
        if (counter.truncated) return null;
        counter.count++;
        if (counter.count > maxNodes) { counter.truncated = true; return null; }

        var node = { name: prop.name };
        try { node.matchName = prop.matchName; } catch (e0) {}

        if (prop.propertyType === PropertyType.PROPERTY) {
            var vr = safeValue(prop);
            if (vr.valueError) node.valueError = vr.valueError; else node.value = vr.value;
            try {
                if (prop.canSetExpression && prop.expressionEnabled && prop.expression) {
                    var expr = prop.expression;
                    if (expr.length > 200) { node.expression = expr.substring(0, 200); node.expressionTruncated = true; }
                    else node.expression = expr;
                }
            } catch (e1) {}
            try { if (prop.numKeys > 0) node.numKeys = prop.numKeys; } catch (e2) {}
        } else {
            if (depth < maxDepth) {
                node.children = [];
                for (var i = 1; i <= prop.numProperties; i++) {
                    if (counter.truncated) break;
                    var child = walkProp(prop.property(i), depth + 1);
                    if (child) node.children.push(child);
                }
            } else {
                node.truncatedDepth = true;
            }
        }
        return node;
    }

    function nodeForLayer(layer) {
        var node = { name: layer.name, matchName: layer.matchName, children: [] };
        for (var i = 1; i <= layer.numProperties; i++) {
            if (counter.truncated) break;
            var child = walkProp(layer.property(i), 1);
            if (child) node.children.push(child);
        }
        return node;
    }

    var result = { comp: comp.name };
    if (args.layerIndex || args.layerName) {
        var layer = null;
        if (args.layerIndex) {
            if (args.layerIndex > 0 && args.layerIndex <= comp.numLayers) layer = comp.layer(args.layerIndex);
        } else {
            for (var li = 1; li <= comp.numLayers; li++) {
                if (comp.layer(li).name === args.layerName) { layer = comp.layer(li); break; }
            }
        }
        if (!layer) return JSON.stringify({ status: "error", message: "Layer not found: " + (args.layerName || "index " + args.layerIndex) });
        result.layer = nodeForLayer(layer);
    } else {
        result.layers = [];
        for (var i2 = 1; i2 <= comp.numLayers; i2++) {
            if (counter.truncated) break;
            result.layers.push(nodeForLayer(comp.layer(i2)));
        }
    }
    if (counter.truncated) result.truncated = true;
    return JSON.stringify(result, null, 2);
}

// Duplicate a composition (source by name, index, or the active comp).
function duplicateComp(args) {
    args = args || {};
    var src = null;
    if (args.compName) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === args.compName) { src = it; break; }
        }
    } else if (args.compIndex) {
        var byIdx = app.project.item(args.compIndex);
        if (byIdx instanceof CompItem) src = byIdx;
    } else if (app.project.activeItem instanceof CompItem) {
        src = app.project.activeItem;
    }
    if (!src) return JSON.stringify({ status: "error", message: "Source comp not found (pass compName or compIndex, or open a comp)" });

    app.beginUndoGroup("Duplicate composition");
    try {
        var dup = src.duplicate();
        if (args.newName) dup.name = args.newName;
        app.endUndoGroup();
        return JSON.stringify({
            status: "success",
            message: "Duplicated '" + src.name + "' -> '" + dup.name + "'",
            comp: { name: dup.name, id: dup.id, numLayers: dup.numLayers }
        }, null, 2);
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ status: "error", message: e.toString() });
    }
}

// --- setCompositionProperties: set duration, frameRate, etc. on active or named comp ---
function setCompositionProperties(args) {
    try {
        var compName = args.compName || "";
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var changed = [];
        if (args.duration !== undefined && args.duration !== null) { comp.duration = args.duration; changed.push("duration"); }
        if (args.frameRate !== undefined && args.frameRate !== null) { comp.frameRate = args.frameRate; changed.push("frameRate"); }
        if (args.width !== undefined && args.width !== null && args.height !== undefined && args.height !== null) {
            comp.width = args.width; comp.height = args.height; changed.push("dimensions");
        }
        return JSON.stringify({
            status: "success",
            composition: { name: comp.name, duration: comp.duration, frameRate: comp.frameRate, width: comp.width, height: comp.height },
            changedProperties: changed
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}
