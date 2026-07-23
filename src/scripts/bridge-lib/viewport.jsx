// Viewport fit/zoom helpers for get-viewport-screenshot. Depends on resolveComp (utils.jsx).

// Zoom the comp's viewer to "Fit up to 100%" before an OS-level screenshot, so the
// capture shows the framed comp centered instead of whatever pan/zoom was left over
// from manual work. Returns the pre-existing zoom so the caller can restore it.
function prepareViewportCapture(args) {
    var comp = resolveComp(args);
    if (!comp) return JSON.stringify({ status: "error", message: "No composition found (pass compName, or make a comp active)." });
    try {
        if (typeof args.time === "number") comp.time = args.time;
        var viewer = comp.openInViewer();
        if (!viewer) return JSON.stringify({ status: "error", message: "Could not open composition '" + comp.name + "' in viewer." });
        var view = viewer.views[viewer.activeViewIndex];
        var savedZoom = view.options.zoom;
        // ponytail: known ceiling — fit-to-view reliably no-ops (root cause believed to be
        // OS-level window focus: executeCommand for panel-scoped commands needs real UI
        // focus, which a script fired from the bridge's idle poll task never has — see git
        // history for the fuller investigation). It doesn't affect the screenshot quality,
        // so this is now best-effort: try, and if it doesn't stick, proceed anyway instead
        // of reporting an error the agent has no useful action to take on.
        try {
            var candidates = ["Fit", "Fit up to 100%", "Fit Up to 100%"];
            var cmdId = 0;
            for (var ci = 0; ci < candidates.length; ci++) {
                cmdId = app.findMenuCommandId(candidates[ci]);
                if (cmdId) break;
            }
            if (cmdId) app.executeCommand(cmdId);
        } catch (fitErr) {}
        return JSON.stringify({
            status: "success",
            compName: comp.name,
            savedZoom: savedZoom,
            time: comp.time,
            projectFile: app.project.file ? app.project.file.name : "Untitled Project"
        });
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
