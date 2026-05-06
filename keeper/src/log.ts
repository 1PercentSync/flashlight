import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
const LOG_FILE = path.join(DATA_DIR, "keeper.log");

let logFd: number | null = null;

function ensureLogFile(): void {
  if (logFd !== null) return;
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  logFd = fs.openSync(LOG_FILE, "a");
}

function write(line: string): void {
  console.log(line);
  try {
    ensureLogFile();
    fs.writeSync(logFd!, line + "\n");
  } catch {}
}

export function log(msg: string): void {
  write(`[${new Date().toISOString()}] [INFO] ${msg}`);
}

export function warn(msg: string): void {
  write(`[${new Date().toISOString()}] [WARN] ${msg}`);
}
