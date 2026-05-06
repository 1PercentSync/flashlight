import path from "node:path";
import fs from "node:fs";
import { info } from "./logger.js";

export async function withLock<T>(workspaceRoot: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.join(workspaceRoot, ".flashlight");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lockPath = path.join(dir, "dir.lock");
  info("lock: acquiring");

  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 10000) {
            fs.rmdirSync(lockPath);
            continue;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      } else {
        throw err;
      }
    }
    if (i === maxRetries - 1) {
      throw new Error("Failed to acquire lock after retries");
    }
  }

  info("lock: acquired");

  try {
    return await fn();
  } finally {
    try {
      fs.rmdirSync(lockPath);
    } catch {}
    info("lock: released");
  }
}
