// Command-file dispatch: reads ae_command.json, routes to the right handler function,
// writes ae_mcp_result.json. Depends on logToPanel/setStatus (defined in the main panel
// file) and getAmbientContext/toISOStringCompat (utils.jsx), plus every domain handler.

// Command file path - use Documents folder for reliable access
function getCommandFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_command.json";
}

// Result file path - use Documents folder for reliable access
function getResultFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_mcp_result.json";
}

// Execute command
function executeCommand(command, args, expectedTimestamp) {
    var result = "";

    logToPanel("Executing command: " + command);
    setStatus("Running: " + command);
    try { panel.update(); } catch (e) {}

    try {
        logToPanel("Attempting to execute: " + command); // Log before switch
        switch (command) {
            case "ping":
                // Pure liveness check - no project/comp/layer access, so it works
                // even when nothing is open, and confirms the poll loop is running.
                result = JSON.stringify({ status: "ok", alive: true, version: __BRIDGE_VERSION });
                break;
            case "getProjectInfo":
                result = getProjectInfo();
                break;
            case "listCompositions":
                result = listCompositions();
                break;
            case "getCompositionInfo":
                result = getCompositionInfo(args);
                break;
            case "getLayerInfo":
                result = getLayerInfo(args);
                break;
            case "getLayerTree":
                result = getLayerTree(args);
                break;
            case "prepareViewportCapture":
                result = prepareViewportCapture(args);
                break;
            case "restoreViewportZoom":
                result = restoreViewportZoom(args);
                break;
            case "duplicateComp":
                result = duplicateComp(args);
                break;
            case "createComposition":
                logToPanel("Calling createComposition function...");
                result = createComposition(args);
                logToPanel("Returned from createComposition.");
                break;
            case "createTextLayer":
                logToPanel("Calling createTextLayer function...");
                result = createTextLayer(args);
                logToPanel("Returned from createTextLayer.");
                break;
            case "createShapeLayer":
                logToPanel("Calling createShapeLayer function...");
                result = createShapeLayer(args);
                logToPanel("Returned from createShapeLayer. Result type: " + typeof result);
                break;
            case "createSolidLayer":
                logToPanel("Calling createSolidLayer function...");
                result = createSolidLayer(args);
                logToPanel("Returned from createSolidLayer.");
                break;
            case "setLayerProperties":
                logToPanel("Calling setLayerProperties function...");
                result = setLayerProperties(args);
                logToPanel("Returned from setLayerProperties.");
                break;
            case "setLayerKeyframe":
                logToPanel("Calling setLayerKeyframe function...");
                result = setLayerKeyframe(args);
                logToPanel("Returned from setLayerKeyframe.");
                break;
            case "setLayerExpression":
                logToPanel("Calling setLayerExpression function...");
                result = setLayerExpression(args);
                logToPanel("Returned from setLayerExpression.");
                break;
            case "getExpression":
                result = getExpression(args);
                break;
            case "setExpressions":
                result = setExpressions(args);
                break;
            case "evaluateProperty":
                result = evaluateProperty(args);
                break;
            case "getEffectPropertiesByMatchName":
                result = getEffectPropertiesByMatchName(args);
                break;
            case "listLayerEffects":
                result = listLayerEffects(args);
                break;
            case "getLayerEffectProperties":
                result = getLayerEffectProperties(args);
                break;
            case "applyEffect":
                logToPanel("Calling applyEffect function...");
                result = applyEffect(args);
                logToPanel("Returned from applyEffect.");
                break;
            case "removeEffect":
                logToPanel("Calling removeEffect function...");
                result = removeEffect(args);
                logToPanel("Returned from removeEffect.");
                break;
            case "renameEffect":
                logToPanel("Calling renameEffect function...");
                result = renameEffect(args);
                logToPanel("Returned from renameEffect.");
                break;
            case "setEffectEnabled":
                logToPanel("Calling setEffectEnabled function...");
                result = setEffectEnabled(args);
                logToPanel("Returned from setEffectEnabled.");
                break;
            case "applyEffectTemplate":
                logToPanel("Calling applyEffectTemplate function...");
                result = applyEffectTemplate(args);
                logToPanel("Returned from applyEffectTemplate.");
                break;
            case "createCamera":
                logToPanel("Calling createCamera function...");
                result = createCamera(args);
                logToPanel("Returned from createCamera.");
                break;
            case "batchSetLayerProperties":
                logToPanel("Calling batchSetLayerProperties function...");
                result = batchSetLayerProperties(args);
                logToPanel("Returned from batchSetLayerProperties.");
                break;
            case "setCompositionProperties":
                logToPanel("Calling setCompositionProperties function...");
                result = setCompositionProperties(args);
                logToPanel("Returned from setCompositionProperties.");
                break;
            case "duplicateLayer":
                logToPanel("Calling duplicateLayer function...");
                result = duplicateLayer(args);
                logToPanel("Returned from duplicateLayer.");
                break;
            case "deleteLayer":
                logToPanel("Calling deleteLayer function...");
                result = deleteLayer(args);
                logToPanel("Returned from deleteLayer.");
                break;
            case "setLayerMask":
                logToPanel("Calling setLayerMask function...");
                result = setLayerMask(args);
                logToPanel("Returned from setLayerMask.");
                break;
            case "runJsx":
                logToPanel("Calling runJsx function...");
                result = runJsx(args);
                logToPanel("Returned from runJsx.");
                break;
            case "listInstalledScripts":
                logToPanel("Calling listInstalledScripts function...");
                result = listInstalledScripts();
                logToPanel("Returned from listInstalledScripts.");
                break;
            default:
                result = JSON.stringify({ error: "Unknown command: " + command });
        }
        logToPanel("Execution finished for: " + command); // Log after switch

        // Save the result (ensure result is always a string)
        logToPanel("Preparing to write result file...");
        var resultString = (typeof result === 'string') ? result : JSON.stringify(result);

        // Try to parse the result as JSON to add a timestamp
        try {
            var resultObj = JSON.parse(resultString);
            resultObj._responseTimestamp = toISOStringCompat(new Date());
            resultObj._commandExecuted = command;
            // Echoes the command file's own timestamp back so Node can match this result to
            // THIS specific request rather than any past-or-future result sharing the same
            // command name (e.g. two rapid runJsx calls where the first timed out client-side
            // but AE finishes it after the second has already been queued).
            resultObj._requestId = expectedTimestamp;
            resultObj.context = getAmbientContext();
            resultString = JSON.stringify(resultObj, null, 2);
            logToPanel("Added timestamp to result JSON for tracking freshness.");
        } catch (parseError) {
            logToPanel("Could not parse result as JSON to add timestamp: " + parseError.toString());
        }

        var resultFile = new File(getResultFilePath());
        resultFile.encoding = "UTF-8"; // Ensure UTF-8 encoding
        logToPanel("Opening result file for writing...");
        var opened = resultFile.open("w");
        if (!opened) {
            logToPanel("ERROR: Failed to open result file for writing: " + resultFile.fsName);
            throw new Error("Failed to open result file for writing.");
        }
        logToPanel("Writing to result file...");
        var written = resultFile.write(resultString);
        if (!written) {
             logToPanel("ERROR: Failed to write to result file (write returned false): " + resultFile.fsName);
        }
        logToPanel("Closing result file...");
        var closed = resultFile.close();
         if (!closed) {
             logToPanel("ERROR: Failed to close result file: " + resultFile.fsName);
        }
        logToPanel("Result file write process complete.");

        logToPanel("Command completed successfully: " + command);
        setStatus("Command completed: " + command);

        logToPanel("Updating command status to completed...");
        updateCommandStatus("completed", expectedTimestamp);
        logToPanel("Command status updated.");

    } catch (error) {
        var errorMsg = "ERROR in executeCommand for '" + command + "': " + error.toString() + (error.line ? " (line: " + error.line + ")" : "");
        logToPanel(errorMsg); // Log detailed error
        setStatus("Error: " + error.toString());

        try {
            logToPanel("Attempting to write ERROR to result file...");
            var errorResult = JSON.stringify({
                status: "error",
                command: command,
                message: error.toString(),
                line: error.line,
                fileName: error.fileName,
                _responseTimestamp: toISOStringCompat(new Date()),
                _commandExecuted: command,
                _requestId: expectedTimestamp,
                context: getAmbientContext()
            });
            var errorFile = new File(getResultFilePath());
            errorFile.encoding = "UTF-8";
            if (errorFile.open("w")) {
                errorFile.write(errorResult);
                errorFile.close();
                logToPanel("Successfully wrote ERROR to result file.");
            } else {
                 logToPanel("CRITICAL ERROR: Failed to open result file to write error!");
            }
        } catch (writeError) {
             logToPanel("CRITICAL ERROR: Failed to write error to result file: " + writeError.toString());
        }

        logToPanel("Updating command status to error...");
        updateCommandStatus("error", expectedTimestamp);
        logToPanel("Command status updated to error.");
    }
}

// Update command file status
// expectedTimestamp (when given) guards against clobbering a newer command: if Node
// wrote a fresh pending command while this one was still running (e.g. after a prior
// timeout), the file on disk no longer belongs to the run finishing now, and blindly
// stamping our status onto it would silently disappear that newer command's result.
function updateCommandStatus(status, expectedTimestamp) {
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();

            if (content) {
                var commandData = JSON.parse(content);
                if (expectedTimestamp && commandData.timestamp !== expectedTimestamp) {
                    logToPanel("Skipped status update - command file now holds a newer command.");
                    return;
                }
                commandData.status = status;

                commandFile.open("w");
                commandFile.write(JSON.stringify(commandData, null, 2));
                commandFile.close();
            }
        }
    } catch (e) {
        logToPanel("Error updating command status: " + e.toString());
    }
}
