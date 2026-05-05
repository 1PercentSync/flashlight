import path from "node:path";
import fs from "node:fs";
import lockfile from "proper-lockfile";

const LOCK_OPTIONS = {
  retries: { retries: 5, minTimeout: 200 },
  stale: 10000,
};

export async function withLock<T>(workspaceRoot: string, fn: () => Promise<T>): Promise<T> {
  const flashlightDir = path.join(workspaceRoot, ".flashlight");
  if (!fs.existsSync(flashlightDir)) {
    fs.mkdirSync(flashlightDir, { recursive: true });
  }

  const release = await lockfile.lock(flashlightDir, {
    ...LOCK_OPTIONS,
    lockfilePath: path.join(flashlightDir, "dir.lock"),
  });

  try {
    return await fn();
  } finally {
    await release();
  }
}
