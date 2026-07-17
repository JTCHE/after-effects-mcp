// Viewport fit/zoom helpers for get-viewport-screenshot. Depends on resolveComp (utils.jsx).

// Zoom the comp's viewer to "Fit up to 100%" before an OS-level screenshot, so the
// capture shows the framed comp centered instead of whatever pan/zoom was left over
// from manual work. Returns the pre-existing zoom so the caller can restore it.
function prepareViewportCapture(args) {
    var comp = resolveComp(args);
    if (!comp) return JSON.stringify({ status: "error", message: "No composition found (pass compName, or make a comp active)." });
    try {
        var viewer = comp.openInViewer();
        if (!viewer) return JSON.stringify({ status: "error", message: "Could not open composition '" + comp.name + "' in viewer." });
        var view = viewer.views[viewer.activeViewIndex];
        var savedZoom = view.options.zoom;
        // "Fit" re-centers the pan and zooms out however far is needed (even past 0%);
        // "Fit up to 100%" only changes zoom and leaves the existing pan alone, which is
        // useless for centering a comp larger than the panel. Menu command names are
        // exact-match strings — if none of these resolve, findMenuCommandId returns 0
        // and executeCommand would silently no-op, so treat "no candidate found" as an
        // error instead of returning success while the viewport stays untouched.
        var candidates = ["Fit", "Fit up to 100%", "Fit Up to 100%"];
        var cmdId = 0;
        for (var ci = 0; ci < candidates.length; ci++) {
            cmdId = app.findMenuCommandId(candidates[ci]);
            if (cmdId) break;
        }
        if (!cmdId) {
            return JSON.stringify({ status: "error", message: "Could not resolve a 'Fit' menu command (tried: " + candidates.join(", ") + ") — viewport zoom was left unchanged." });
        }
        app.executeCommand(cmdId);
        return JSON.stringify({ status: "success", compName: comp.name, savedZoom: savedZoom });
    } catch (e) {
        return JSON.stringify({ status: "error", message: "prepareViewportCapture failed: " + e.toString() });
    }
}

// Companion to prepareViewportCapture — restores the zoom saved before the fit-to-view
// so a screenshot doesn't leave the user's own pan/zoom disturbed.
function restoreViewportZoom(args) {
    var comp = resolveComp(args);
    if (!comp) return JSON.stringify({ status: "error", message: "No composition found." });
    if (typeof args.zoom !== "number") return JSON.stringify({ status: "error", message: "No zoom value provided to restore." });
    try {
        var viewer = comp.openInViewer();
        if (!viewer) return JSON.stringify({ status: "error", message: "Could not open composition '" + comp.name + "' in viewer." });
        var view = viewer.views[viewer.activeViewIndex];
        view.options.zoom = args.zoom;
        return JSON.stringify({ status: "success" });
    } catch (e) {
        return JSON.stringify({ status: "error", message: "restoreViewportZoom failed: " + e.toString() });
    }
}
