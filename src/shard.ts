import crypto from "node:crypto";
import type { Snapshot } from "./scanner.js";
import type { ShardMeta } from "./base.js";
import { warn } from "./logger.js";

/** A single shard: a group of files that fits within the token budget. */
export interface ShardEntry {
  /** Unique shard identifier (directory path or "__all__" / "__root__"). */
  id: string;
  /** Directory prefix that all files in this shard share. */
  prefix: string;
  /** List of relative file paths belonging to this shard. */
  files: string[];
  /** Total token count of all files in this shard. */
  tokens: number;
}

/** A complete shard plan describing how to partition the codebase. */
export interface ShardPlan {
  /** Ordered list of shards covering all files. */
  shards: ShardEntry[];
  /** Hash of shard boundaries — changes when shards are re-split. */
  planHash: string;
}

/** Compute a fresh shard plan by recursively splitting directories until each fits the token budget. */
export function computeShardPlan(snapshot: Snapshot, maxContextTokens: number): ShardPlan {
  const allFiles = [...snapshot.keys()];
  const totalTokens = sumTokens(allFiles, snapshot);

  if (totalTokens <= maxContextTokens) {
    const shards: ShardEntry[] = [{ id: "__all__", prefix: "", files: allFiles, tokens: totalTokens }];
    return { shards, planHash: computePlanHash(shards) };
  }

  const shards = splitLevel("", allFiles, snapshot, maxContextTokens);
  return { shards, planHash: computePlanHash(shards) };
}

/**
 * Resolve the shard plan: reuse the stored plan if all shards still fit,
 * otherwise recompute from scratch. Empty shards are pruned; if remaining
 * shards fit in a single shard, collapses back to single-shard mode.
 */
export function resolveShardPlan(
  snapshot: Snapshot,
  maxContextTokens: number,
  storedMeta: ShardMeta | null,
): ShardPlan {
  if (!storedMeta) {
    return computeShardPlan(snapshot, maxContextTokens);
  }

  for (const { id, prefix } of storedMeta.shards) {
    const files = getFilesForPrefix(snapshot, prefix);
    const tokens = sumTokens(files, snapshot);
    if (tokens > maxContextTokens) {
      return computeShardPlan(snapshot, maxContextTokens);
    }
  }

  const shards: ShardEntry[] = storedMeta.shards
    .map(({ id, prefix }) => {
      const files = getFilesForPrefix(snapshot, prefix);
      const tokens = sumTokens(files, snapshot);
      return { id, prefix, files, tokens };
    })
    .filter((s) => s.files.length > 0);

  if (shards.length === 0) {
    return computeShardPlan(snapshot, maxContextTokens);
  }

  return { shards, planHash: computePlanHash(shards) };
}

/** Compute a deterministic hash of shard boundaries for change detection. */
export function computePlanHash(shards: ShardEntry[]): string {
  const boundaries = shards
    .map((s) => `${s.id}:${s.prefix}`)
    .sort()
    .join("\n");
  return crypto.createHash("sha256").update(boundaries).digest("hex").slice(0, 16);
}

function splitLevel(
  parentPrefix: string,
  files: string[],
  snapshot: Snapshot,
  maxContextTokens: number,
): ShardEntry[] {
  const groups = groupByNextSegment(parentPrefix, files);
  const shards: ShardEntry[] = [];

  for (const [segment, groupFiles] of groups) {
    const tokens = sumTokens(groupFiles, snapshot);
    const prefix = segment === "__root__"
      ? parentPrefix
      : parentPrefix ? `${parentPrefix}${segment}/` : `${segment}/`;
    const id = segment === "__root__"
      ? (parentPrefix ? `${parentPrefix}__root__` : "__root__")
      : prefix.slice(0, -1);

    if (tokens <= maxContextTokens) {
      shards.push({ id, prefix, files: groupFiles, tokens });
    } else if (segment === "__root__" || !canSplitFurther(parentPrefix, segment, groupFiles)) {
      warn(`shard "${id}" exceeds budget (${tokens} tokens > ${maxContextTokens}), cannot split further`);
      shards.push({ id, prefix, files: groupFiles, tokens });
    } else {
      const subShards = splitLevel(prefix, groupFiles, snapshot, maxContextTokens);
      shards.push(...subShards);
    }
  }

  return shards;
}

function groupByNextSegment(parentPrefix: string, files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const relative = parentPrefix ? file.slice(parentPrefix.length) : file;
    const slashIdx = relative.indexOf("/");

    let segment: string;
    if (slashIdx === -1) {
      segment = "__root__";
    } else {
      segment = relative.slice(0, slashIdx);
    }

    if (!groups.has(segment)) groups.set(segment, []);
    groups.get(segment)!.push(file);
  }

  return groups;
}

function canSplitFurther(parentPrefix: string, segment: string, files: string[]): boolean {
  const prefix = parentPrefix ? `${parentPrefix}${segment}/` : `${segment}/`;
  for (const file of files) {
    const relative = file.slice(prefix.length);
    if (relative.includes("/")) return true;
  }
  return false;
}

function getFilesForPrefix(snapshot: Snapshot, prefix: string): string[] {
  if (!prefix) return [...snapshot.keys()];
  return [...snapshot.keys()].filter((f) => f.startsWith(prefix));
}

function sumTokens(files: string[], snapshot: Snapshot): number {
  let total = 0;
  for (const f of files) {
    const entry = snapshot.get(f);
    if (entry) total += entry.tokens;
  }
  return total;
}
