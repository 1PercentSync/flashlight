import fs from "node:fs";
import path from "node:path";
import { countTokens } from "./tokenizer.js";
import type { Snapshot } from "./scanner.js";

export interface BaseData {
  first_turn_text: string;
  first_turn_token_count: number;
  base_token_count: number;
  base_request_text: string;
  file_hashes: Record<string, string>;
  timestamp: number;
}

export function readBase(workspaceRoot: string): BaseData | null {
  const basePath = path.join(workspaceRoot, ".flashlight", "base.json");
  if (!fs.existsSync(basePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(basePath, "utf-8"));
  } catch {
    return null;
  }
}

export function writeBase(workspaceRoot: string, data: BaseData): boolean {
  const dir = path.join(workspaceRoot, ".flashlight");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const basePath = path.join(dir, "base.json");
  if (fs.existsSync(basePath)) {
    try {
      const existing: BaseData = JSON.parse(fs.readFileSync(basePath, "utf-8"));
      if (existing.timestamp >= data.timestamp) {
        return false;
      }
    } catch {}
  }

  fs.writeFileSync(basePath, JSON.stringify(data, null, 2));
  return true;
}

export interface ChangeDetectionResult {
  changedFiles: string[];
  deletedFiles: string[];
  changeTokenRatio: number;
}

export function detectChanges(snapshot: Snapshot, base: BaseData): ChangeDetectionResult {
  const changedFiles: string[] = [];
  const deletedFiles: string[] = [];

  for (const [filePath, savedHash] of Object.entries(base.file_hashes)) {
    const entry = snapshot.get(filePath);
    if (!entry) {
      deletedFiles.push(filePath);
    } else if (entry.hash !== savedHash) {
      changedFiles.push(filePath);
    }
  }

  for (const filePath of snapshot.keys()) {
    if (!(filePath in base.file_hashes)) {
      changedFiles.push(filePath);
    }
  }

  let changeTokens = 0;
  for (const file of changedFiles) {
    const entry = snapshot.get(file);
    if (entry) {
      changeTokens += countTokens(entry.content);
    }
  }

  const changeTokenRatio = base.base_token_count > 0
    ? changeTokens / base.base_token_count
    : 1;

  return { changedFiles, deletedFiles, changeTokenRatio };
}
