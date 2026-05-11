import fs from "node:fs";
import path from "node:path";

let logFile: number | null = null;

/** Initialize the file logger, creating `.flashlight/flashlight.log` if needed. */
export function initLogger(workspaceRoot: string): void {
  const dir = path.join(workspaceRoot, ".flashlight");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  logFile = fs.openSync(path.join(dir, "flashlight.log"), "a");
}

function write(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(`[flashlight] ${msg}\n`);
  if (logFile !== null) {
    fs.writeSync(logFile, line);
  }
}

/** Log an informational message to stderr and the log file. */
export function info(msg: string): void {
  write(msg);
}

/** Log a warning message. */
export function warn(msg: string): void {
  write(`WARN: ${msg}`);
}

/** Log an error message. */
export function error(msg: string): void {
  write(`ERROR: ${msg}`);
}
