// bridge-entry.jsx
// UI/polling half of the MCP Bridge panel. This file is NOT deployed directly —
// `npm run build` concatenates bridge-lib/*.jsx + this file into the generated
// "MCP Bridge.jsx", which is what actually gets copied to the AE install path.
// (An ExtendScript #include-based split was tried first and reverted: AE's
// reloadBridge()'s `$.evalFile` did not process #include directives the same way
// panel-open does — a live test left reloadBridge silently no-op'ing instead of
// picking up new code. Build-time concatenation gives identical runtime behavior
// to the old single-file bridge while still keeping the source small and modular.)

// Remember where AE loaded us from, and distinguish a code-only reload (our
// "Reload Panel" button re-evals this file) from a fresh panel open by AE. On a
// reload we refresh all the handler functions but skip rebuilding the UI /
// rescheduling the poller — so no second window and no double polling.
$.global.__mcpBridgeScriptFile = $.fileName;
var __mcpReloading = ($.global.__mcpBridgeReloading === true);
$.global.__mcpBridgeReloading = false;
var __BRIDGE_VERSION = "v3-split";

// Build the UI only on a real panel open (skip on a code-only reload — the
// existing widgets and their globals are reused).
if (!__mcpReloading) {
// Dockable when launched from the ScriptUI Panels folder (AE passes a Panel as `this`);
// falls back to a floating palette when run any other way. This is the canonical AE idiom.
var panel = (this instanceof Panel) ? this : new Window("palette", "MCP Bridge", undefined, {resizeable: true});
panel.orientation = "column";
panel.alignChildren = ["fill", "top"];
panel.spacing = 10;
panel.margins = 16;

// Status display
var statusText = panel.add("statictext", undefined, "Waiting for commands...");
statusText.alignment = ["fill", "top"];

// Add log area
var logPanel = panel.add("panel", undefined, "Command Log");
logPanel.orientation = "column";
logPanel.alignChildren = ["fill", "fill"];
var logText = logPanel.add("edittext", undefined, "", {multiline: true, readonly: true});
logText.preferredSize.height = 200;

// Auto-run checkbox
var autoRunCheckbox = panel.add("checkbox", undefined, "Auto-run commands");
autoRunCheckbox.value = true;

// Check interval (ms)
var checkInterval = 2000;
var isChecking = false;
// app.scheduleTask task id, so we can cancel a stale/duplicate schedule before
// re-arming (AE can silently drop the repeating task while a modal-ish UI
// state — e.g. the Timeline's inline expression editor — is active).
var scheduledTaskId = null;
// Updated at the top of every checkForCommands() run. onActivate below compares
// against this to notice a dead poller and self-heal without a manual click.
var lastPollAt = new Date().getTime();
}

// Log message to panel. logText can be transiently unavailable mid-reloadBridge()
// (the fresh $.evalFile pass skips UI rebuild but there's a brief window before
// this function itself is redefined) — never let a log call crash the command.
function logToPanel(message) {
    var timestamp = new Date().toLocaleTimeString();
    try {
        logText.text = timestamp + ": " + message + "\n" + logText.text;
    } catch (e) {}
}

// Same transient-unavailability risk as logToPanel, for the other UI widget commonly
// touched mid-command (see logToPanel's comment).
function setStatus(message) {
    try {
        statusText.text = message;
    } catch (e) {}
}

// Check for new commands
function checkForCommands() {
    try {
        if (!autoRunCheckbox.value || isChecking) return;
    } catch (e) {
        return; // autoRunCheckbox transiently unavailable (mid-reloadBridge) - skip this poll
    }

    isChecking = true;
    lastPollAt = new Date().getTime();
    var pollTime = new Date().toLocaleTimeString();

    // try/finally so isChecking ALWAYS gets reset, even if something in here
    // throws in a way the inner catch doesn't expect. A stuck isChecking=true
    // would silently no-op every future poll forever.
    try {
        try {
            var commandFile = new File(getCommandFilePath());
            var ranCommand = false;
            if (commandFile.exists) {
                commandFile.open("r");
                var content = commandFile.read();
                commandFile.close();

                if (content) {
                    var commandData = (typeof JSON !== "undefined" && JSON.parse)
                        ? JSON.parse(content)
                        : eval("(" + content + ")");

                    // Only execute pending commands
                    if (commandData.status === "pending") {
                        // Update status to running
                        updateCommandStatus("running", commandData.timestamp);

                        // Execute the command
                        executeCommand(commandData.command, commandData.args || {}, commandData.timestamp);
                        ranCommand = true;
                    }
                }
            }
            // Heartbeat: make it visually obvious in the panel that polling is
            // alive, instead of silently doing nothing when there's no command.
            if (!ranCommand) {
                setStatus("Waiting for commands... (last poll " + pollTime + ")");
            }
        } catch (e) {
            logToPanel("Error checking for commands: " + e.toString());
        }
    } finally {
        isChecking = false;
        // Re-arm the NEXT check as a fresh one-shot task rather than relying on
        // app.scheduleTask's own repeating mode. AE has been observed to silently
        // drop a repeating task and never resume it; a one-shot that reschedules
        // itself each time it actually runs has no persistent repeating task for
        // AE to drop in the first place.
        startCommandChecker();
    }
}

// Schedule the next checkForCommands() call. Cancels any previously-scheduled
// task first — belt-and-suspenders against stacking duplicate concurrent
// pollers (e.g. if both a self-rearm and a manual Force Check Now race).
function startCommandChecker() {
    if (scheduledTaskId !== null && scheduledTaskId !== undefined) {
        try { app.cancelTask(scheduledTaskId); } catch (e) {}
    }
    scheduledTaskId = app.scheduleTask("checkForCommands()", checkInterval, false);
}

// Runs checkForCommands() synchronously, right now, from a button click, AND
// re-arms the scheduled poll task. A manual click always reaches AE's event
// loop even when app.scheduleTask has stalled (e.g. AE suspended it during an
// expression-editor edit) — but the stalled task itself was never cancelled
// or rescheduled, so a plain one-off check here used to leave polling dead
// afterward. Re-arming makes this a real unstick, not just a single peek.
function forceCheckNow() {
    isChecking = false; // defensive: clear a stuck flag before forcing a check
    logToPanel("Force Check Now clicked.");
    startCommandChecker(); // cancel + re-arm the polling task
    checkForCommands();
}

// Re-eval this file from disk so edits to the handlers take effect without
// closing/reopening the panel. Sets a flag the fresh eval reads to skip UI rebuild.
// Also does a FULL reset of the poller and runs an immediate synchronous check
// (via forceCheckNow) so this button is a real reset, not just a code refresh.
function reloadBridge() {
    try {
        var f = new File($.global.__mcpBridgeScriptFile);
        if (!f.exists) { logToPanel("Reload failed - script not found: " + f.fsName); return; }
        logToPanel("Reloading handlers from " + f.fsName);
        $.global.__mcpBridgeReloading = true;
        $.evalFile(f);
        logToPanel("Reload complete.");
        setStatus("Reloaded panel code and restarted polling.");
        forceCheckNow(); // cancel + re-arm the polling task and run a check now
    } catch (e) {
        $.global.__mcpBridgeReloading = false;
        logToPanel("Reload error: " + e.toString());
    }
}

if (!__mcpReloading) {
var buttonRow = panel.add("group", undefined);
buttonRow.orientation = "row";

// Reload: pulls the latest handler code off disk, fully resets the poller
// (cancels + re-arms the scheduled task, clears isChecking), and runs an
// immediate synchronous check - combines the old "Reload Panel" and
// "Force Check Now" buttons into one action.
var reloadButton = buttonRow.add("button", undefined, "Reload");
reloadButton.onClick = function() { reloadBridge(); };

// Log startup
logToPanel("MCP Bridge started");
logToPanel("Command file: " + getCommandFilePath());
statusText.text = "Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF");

// Start the command checker
startCommandChecker();

// Self-heal watchdog: onActivate fires whenever the panel gains focus (docking/
// undocking, clicking into it, AE bringing it forward), which — like a button
// click — always reaches AE's event loop even when app.scheduleTask has
// stalled. If polling looks dead (no check ran for 3+ intervals), re-arm it
// automatically instead of waiting for someone to notice and click "Force
// Check Now". This piggybacks on ordinary panel focus during normal AE use —
// no dedicated user action required.
panel.onActivate = function () {
    var idleFor = new Date().getTime() - lastPollAt;
    if (idleFor > checkInterval * 3) {
        logToPanel("Self-heal: poll loop looked stalled (idle " + Math.round(idleFor / 1000) + "s), re-arming.");
        isChecking = false;
        startCommandChecker();
    }
};

// Lay out, and keep contents resizing with the panel/window frame.
panel.layout.layout(true);
panel.layout.resize();
panel.onResizing = panel.onResize = function () { this.layout.resize(); };

// Only a floating Window needs to be centered and shown; a docked Panel is already visible.
if (panel instanceof Window) {
    panel.center();
    panel.show();
}
}
