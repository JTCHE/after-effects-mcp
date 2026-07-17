// Low-level IPC with the AE-side MCP Bridge.jsx panel: file-based command/result
// JSON in ~/Documents/ae-mcp-bridge, with a requestId/timestamp nonce so a stale
// same-named result can't satisfy a later call's wait (see waitForBridgeResult).
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function getAETempDir(): string {
  const homeDir = os.homedir();
  const bridgeDir = path.join(homeDir, 'Documents', 'ae-mcp-bridge');
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}

export function readResultsFromTempFile(): string {
  try {
    const tempFilePath = path.join(getAETempDir(), 'ae_mcp_result.json');
    console.error(`Checking for results at: ${tempFilePath}`);

    if (fs.existsSync(tempFilePath)) {
      const stats = fs.statSync(tempFilePath);
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      console.error(`Result file content length: ${content.length} bytes`);

      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error(`WARNING: Result file is older than 30 seconds. After Effects may not be updating results.`);
        return JSON.stringify({
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the MCP Bridge panel isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }

      return content;
    } else {
      console.error(`Result file not found at: ${tempFilePath}`);
      return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
    }
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}

// The bridge stamps ae_command.json's status field as it processes a command:
// "pending" -> "running" -> "completed"/"error" (see checkForCommands/updateCommandStatus
// in MCP Bridge.jsx). Reading it after a timeout distinguishes failure modes that would
// otherwise all look like the same generic "timed out".
function diagnoseTimeout(requestId?: string): string {
  try {
    const commandFile = path.join(getAETempDir(), 'ae_command.json');
    if (!fs.existsSync(commandFile)) {
      return " No command file found on disk — the command was never queued.";
    }
    const data = JSON.parse(fs.readFileSync(commandFile, 'utf8'));
    if (requestId && data.timestamp !== requestId) {
      return " A newer command has since overwritten the command file — this call's request may have been superseded.";
    }
    if (data.status === "pending") {
      return " The bridge never picked up the command (still 'pending') — the MCP Bridge panel may be closed, or its polling loop has stalled. Try 'Force Check Now' in the panel, or the reload-bridge tool.";
    }
    if (data.status === "running") {
      return " The bridge picked up the command and started running it, but hasn't finished — likely a long-running script or a blocking modal dialog (e.g. an alert()) in After Effects.";
    }
    return ` The bridge reports status '${data.status}' for this command but no matching result arrived — possible stale/mismatched result file.`;
  } catch {
    return "";
  }
}

// requestId (when given) is the exact timestamp this call's writeCommandFile used, echoed
// back by the bridge as `_requestId` — matching on it means two rapid calls to the same
// command can't have the first call's late-arriving result mistakenly satisfy the second.
export async function waitForBridgeResult(expectedCommand?: string, timeoutMs: number = 5000, pollMs: number = 250, requestId?: string): Promise<string> {
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
  let lastSize = -1;

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        if (content && content.length > 0 && content.length !== lastSize) {
          lastSize = content.length;
          try {
            const parsed = JSON.parse(content);
            const commandMatches = !expectedCommand || parsed._commandExecuted === expectedCommand;
            const requestMatches = !requestId || parsed._requestId === requestId;
            if (commandMatches && requestMatches) {
              return content;
            }
          } catch {
            // not JSON yet; continue polling
          }
        }
      } catch {
        // transient read error; continue polling
      }
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  const label = expectedCommand ? ` for command '${expectedCommand}'` : '';
  return JSON.stringify({ error: `Timed out waiting for bridge result${label}.${diagnoseTimeout(requestId)}` });
}

// Returns the request's timestamp, which doubles as a nonce — see waitForBridgeResult.
// Throws on failure instead of swallowing it — a caller that couldn't queue the command
// would otherwise still wait out the full timeout and report a misleading "timed out".
export function writeCommandFile(command: string, args: Record<string, any> = {}): string {
  const commandFile = path.join(getAETempDir(), 'ae_command.json');
  const timestamp = new Date().toISOString();
  const commandData = {
    command,
    args,
    timestamp,
    status: "pending"  // pending, running, completed, error
  };
  fs.writeFileSync(commandFile, JSON.stringify(commandData, null, 2));
  console.error(`Command "${command}" written to ${commandFile}`);
  return timestamp;
}

// Throws on failure — see writeCommandFile's comment; a swallowed failure here risks
// matching a stale leftover result from a previous call to the same command.
export function clearResultsFile(): void {
  const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');
  const resetData = {
    status: "waiting",
    message: "Waiting for new result from After Effects...",
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(resultFile, JSON.stringify(resetData, null, 2));
  console.error(`Results file cleared at ${resultFile}`);
}

// Queue a command and block until the bridge writes back a matching result,
// so tools return the actual outcome instead of "queued, go poll get-results".
export async function runAndWait(command: string, args: Record<string, any> = {}, timeoutMs: number = 15000) {
  clearResultsFile();
  const requestId = writeCommandFile(command, args);
  const result = await waitForBridgeResult(command, timeoutMs, 250, requestId);
  let isError = false;
  try {
    isError = JSON.parse(result)?.status === "error";
  } catch { /* non-JSON result stays isError:false */ }
  return {
    content: [{ type: "text" as const, text: result }],
    ...(isError ? { isError: true } : {})
  };
}
