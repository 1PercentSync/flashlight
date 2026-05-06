import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import ignore, { type Ignore } from "ignore";
import type { FlashlightConfig } from "./config.js";

export interface FileEntry {
  relativePath: string;
  content: string;
  hash: string;
}

export type Snapshot = Map<string, FileEntry>;

export function createSnapshot(workspaceRoot: string, config: FlashlightConfig): Snapshot {
  const ig = loadGitignore(workspaceRoot);
  const files = scanFiles(workspaceRoot, workspaceRoot, ig, config.ext_whitelist);
  const snapshot: Snapshot = new Map();
  for (const relativePath of files) {
    const fullPath = path.join(workspaceRoot, relativePath);
    const content = fs.readFileSync(fullPath, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    snapshot.set(relativePath, { relativePath, content, hash });
  }
  return snapshot;
}

export function sortByGitTime(workspaceRoot: string, files: string[]): string[] {
  const times = new Map<string, number>();
  const hasGit = fs.existsSync(path.join(workspaceRoot, ".git"));

  for (const file of files) {
    if (hasGit) {
      try {
        const stdout = execSync(
          `git log -1 --format=%ct -- "${file}"`,
          { cwd: workspaceRoot, encoding: "utf-8", timeout: 5000 },
        ).trim();
        if (stdout) {
          times.set(file, parseInt(stdout, 10));
          continue;
        }
      } catch {}
    }
    const fullPath = path.join(workspaceRoot, file);
    times.set(file, Math.floor(fs.statSync(fullPath).mtimeMs / 1000));
  }

  return [...files].sort((a, b) => (times.get(a) ?? 0) - (times.get(b) ?? 0));
}

function loadGitignore(workspaceRoot: string): Ignore {
  const ig = ignore();
  ig.add(".git");
  ig.add(".flashlight");

  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf-8"));
  }
  return ig;
}

function scanFiles(
  root: string,
  dir: string,
  ig: Ignore,
  extWhitelist: string[],
): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");

    if (ig.ignores(relativePath + (entry.isDirectory() ? "/" : ""))) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...scanFiles(root, fullPath, ig, extWhitelist));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extWhitelist.includes(ext)) {
        results.push(relativePath);
      }
    }
  }

  return results;
}
