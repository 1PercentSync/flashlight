import fs from "node:fs";
import path from "node:path";
import { countTokens } from "./tokenizer.js";
import type { Snapshot } from "./scanner.js";

/** Persisted base state, stored in `.flashlight/base.json`. */
export interface BaseData {
  /** Total prompt tokens as reported by the API when this base was built. */
  base_token_count: number;
  /** The exact text sent as the base context message (for prefix cache reuse). */
  base_request_text: string;
  /** Map of relative file path to SHA-256 content hash at build time. */
  file_hashes: Record<string, string>;
  /** Unix timestamp (ms) when this base was created. Used for write-conflict resolution. */
  timestamp: number;
}

/** Metadata about the current shard plan, stored in `.flashlight/shard_meta.json`. */
export interface ShardMeta {
  /** Hash of shard boundaries — if changed, all shards need rebuild. */
  planHash: string;
  /** List of shard identifiers and their directory prefixes. */
  shards: { id: string; prefix: string }[];
  /** Unix timestamp (ms) of last plan update. */
  timestamp: number;
}

/** Read base.json from disk. Returns null if not found or malformed. */
export function readBase(workspaceRoot: string): BaseData | null {
  const basePath = path.join(workspaceRoot, ".flashlight", "base.json");
  if (!fs.existsSync(basePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(basePath, "utf-8"));
  } catch {
    return null;
  }
}

/** Write base.json to disk. Skips write if existing file has a newer timestamp. Returns true if written. */
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

/** Result of comparing a snapshot against a saved base. */
export interface ChangeDetectionResult {
  /** Files that are new or have different content hash. */
  changedFiles: string[];
  /** Files that existed in base but are gone from the snapshot. */
  deletedFiles: string[];
  /** Ratio of changed file tokens to base_token_count (triggers rebuild when > threshold). */
  changeTokenRatio: number;
}

/** Compare a live snapshot against a saved base to identify file changes. */
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

// --- Shard storage ---

function sanitizeShardId(id: string): string {
  return id.replace(/\//g, "__");
}

/** Read the shard plan metadata from disk. */
export function readShardMeta(workspaceRoot: string): ShardMeta | null {
  const metaPath = path.join(workspaceRoot, ".flashlight", "shard_meta.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

/** Persist shard plan metadata to disk. */
export function writeShardMeta(workspaceRoot: string, meta: ShardMeta): void {
  const dir = path.join(workspaceRoot, ".flashlight");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "shard_meta.json"), JSON.stringify(meta, null, 2));
}

/** Read a per-shard base file from disk. */
export function readShardBase(workspaceRoot: string, shardId: string): BaseData | null {
  const filePath = path.join(workspaceRoot, ".flashlight", `shard_${sanitizeShardId(shardId)}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/** Write a per-shard base file. Skips if existing has newer timestamp. */
export function writeShardBase(workspaceRoot: string, shardId: string, data: BaseData): boolean {
  const dir = path.join(workspaceRoot, ".flashlight");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `shard_${sanitizeShardId(shardId)}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const existing: BaseData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (existing.timestamp >= data.timestamp) return false;
    } catch {}
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return true;
}

/** Delete shard base files that are no longer part of the active plan. */
export function cleanupShardFiles(workspaceRoot: string, keepIds: string[]): void {
  const dir = path.join(workspaceRoot, ".flashlight");
  if (!fs.existsSync(dir)) return;

  const keepSet = new Set(keepIds.map((id) => `shard_${sanitizeShardId(id)}.json`));
  keepSet.add("shard_meta.json");

  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith("shard_") && !keepSet.has(file)) {
      try {
        fs.unlinkSync(path.join(dir, file));
      } catch {}
    }
  }
}
