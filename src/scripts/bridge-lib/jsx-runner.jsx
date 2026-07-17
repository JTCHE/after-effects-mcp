// Generic escape hatch (runJsx) and installed-script discovery (listInstalledScripts).

// Generic escape hatch: execute raw ExtendScript (args.code) or a .jsx file (args.filePath).
// Wraps in an undo group and captures thrown errors with line numbers so the agent
// can debug scripts it writes on the fly instead of relying on bespoke per-feature tools.
function runJsx(args) {
    args = args || {};
    var code = args.code;
    var sourceLabel = "inline code";
    if (!code && args.filePath) {
        var f = new File(args.filePath);
        if (!f.exists) return JSON.stringify({ status: "error", message: "File not found: " + args.filePath });
        f.encoding = "UTF-8";
        f.open("r");
        code = f.read();
        f.close();
        sourceLabel = args.filePath;
    }
    if (!code) return JSON.stringify({ status: "error", message: "Provide either 'code' (raw ExtendScript) or 'filePath' (.jsx file)." });

    app.beginUndoGroup("MCP runJsx: " + sourceLabel);
    try {
        var evalResult = eval(code);
        app.endUndoGroup();

        var serialized = null;
        var note;
        if (evalResult === undefined) {
            note = "script returned undefined (no trailing expression)";
        } else {
            try {
                JSON.stringify(evalResult); // throws on circular refs / AE objects
                serialized = evalResult;
            } catch (serErr) {
                serialized = String(evalResult);
            }
        }

        var envelope = { status: "success", source: sourceLabel, result: serialized };
        if (note) envelope.note = note;
        var resultStr = JSON.stringify(envelope, null, 2);
        if (resultStr.length > 100000) {
            resultStr = JSON.stringify({ status: "success", source: sourceLabel, result: "[truncated: result exceeded 100KB]" }, null, 2);
        }
        return resultStr;
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ status: "error", source: sourceLabel, message: e.message || e.toString(), line: e.line || null });
    }
}

// List .jsx/.jsxbin scripts installed under the AE app folder so the agent can see
// what's already available (e.g. a user's own ScriptUI panel) before writing its own.
function listInstalledScripts() {
    var result = { scriptsFolder: [], scriptUIPanels: [] };

    function listDir(dir) {
        var out = [];
        if (dir.exists) {
            var files = dir.getFiles(function (f) {
                return f instanceof File && /\.(jsx|jsxbin)$/i.test(f.name);
            });
            for (var i = 0; i < files.length; i++) {
                out.push({
                    name: files[i].name,
                    path: files[i].fsName,
                    type: /\.jsxbin$/i.test(files[i].name) ? "compiled" : "source"
                });
            }
        }
        return out;
    }

    var base = new Folder(app.path.fsName);
    result.scriptsFolder = listDir(new Folder(base.fsName + "/Scripts"));
    result.scriptUIPanels = listDir(new Folder(base.fsName + "/Scripts/ScriptUI Panels"));
    return JSON.stringify(result, null, 2);
}
