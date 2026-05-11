#!/usr/bin/env node
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadConfig } from "./config.js";
import type { FlashlightConfig } from "./config.js";
import { initTokenizer, countTokens } from "./tokenizer.js";
import { withLock } from "./lock.js";
import { createSnapshot, resetGitTimeCache, type Snapshot } from "./scanner.js";
import {
  readBase, writeBase, detectChanges,
  readShardMeta, writeShardMeta, readShardBase, writeShardBase, cleanupShardFiles,
  type BaseData, type ShardMeta,
} from "./base.js";
import {
  getSystemInstructions,
  getShardedSystemInstructions,
  buildBaseContext,
  buildShardBaseContext,
  buildChangeContext,
  buildDirectoryTree,
  buildQueryTurn,
} from "./context.js";
import { initDeepSeek, sendQuery, sendParallelQueries } from "./deepseek.js";
import { extractResults } from "./extractor.js";
import { resolveShardPlan, type ShardPlan, type ShardEntry } from "./shard.js";
import { initLogger, info, error } from "./logger.js";
import type { SearchResult } from "./deepseek.js";

const server = new McpServer({ name: "flashlight", version: "0.5.0" });
let config: FlashlightConfig;
let workspaceRoot: string;

server.registerTool(
  "search",
  {
    description: "Search code in the workspace using DeepSeek's 1M context window. Returns full code snippets when results are small, or an index of file:line-range locations when results are large. IMPORTANT: When the response starts with 'Results exceed size limit', DO NOT retry with narrower queries. Instead, use the Read tool to read ALL files listed in the index to view their content. The index IS the successful search result — it tells you exactly where the relevant code is, and you must read every entry.",
    inputSchema: z.object({
      query: z.string().describe("Natural language description of the code to find"),
      scope: z.string().optional().describe("Relative directory path to narrow search scope"),
      file_types: z.array(z.string()).optional().describe("File extensions to filter (e.g. [\".ts\", \".py\"])"),
    }),
  },
  async ({ query, scope, file_types }): Promise<CallToolResult> => {
    try {
      return await handleQuery(query, scope, file_types);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(msg);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

async function handleQuery(
  query: string,
  scope?: string,
  fileTypes?: string[],
): Promise<CallToolResult> {
  await ensureInitialized();
  info(`--- query start: "${query.slice(0, 80)}"${scope ? ` scope=${scope}` : ""}${fileTypes ? ` types=${fileTypes.join(",")}` : ""} ---`);

  resetGitTimeCache();
  const snapshot = createSnapshot(workspaceRoot, config);
  info(`snapshot: ${snapshot.size} files`);

  const storedMeta = readShardMeta(workspaceRoot);
  const plan = resolveShardPlan(snapshot, config.max_context_tokens, storedMeta);

  if (plan.shards.length === 1 && plan.shards[0].id === "__all__") {
    return handleSingleQuery(snapshot, query, scope, fileTypes);
  }

  info(`sharded: ${plan.shards.length} shards [${plan.shards.map((s) => `${s.id}(${s.tokens}t)`).join(", ")}]`);
  return handleShardedQuery(snapshot, plan, storedMeta, query, scope, fileTypes);
}

// --- Single-shard path ---

async function handleSingleQuery(
  snapshot: Snapshot,
  query: string,
  scope?: string,
  fileTypes?: string[],
): Promise<CallToolResult> {
  const base = await withLock(workspaceRoot, async () => readBase(workspaceRoot));

  let needRebuild = false;
  let baseContext = "";
  let changeContext = "";

  if (!base) {
    info("no base.json found, rebuilding");
    needRebuild = true;
  } else {
    info(`base loaded: ${Object.keys(base.file_hashes).length} files, ${base.base_token_count} tokens`);

    const changes = detectChanges(snapshot, base);
    if (changes.changedFiles.length > 0) {
      info(`changed files: ${changes.changedFiles.join(", ")}`);
    }
    if (changes.deletedFiles.length > 0) {
      info(`deleted files: ${changes.deletedFiles.join(", ")}`);
    }
    info(`change ratio: ${changes.changeTokenRatio.toFixed(4)} (threshold: ${config.change_threshold})`);

    if (changes.changeTokenRatio > config.change_threshold) {
      info("change ratio exceeds threshold, rebuilding base");
      needRebuild = true;
    } else {
      info("reusing base, building change context");
      baseContext = base.base_request_text;
      changeContext = buildChangeContext(snapshot, changes);
      if (changeContext) {
        info(`change context: ${changeContext.length} chars`);
      }
    }
  }

  if (needRebuild) {
    baseContext = buildBaseContext(workspaceRoot, snapshot);
    info(`rebuild: base context=${baseContext.length} chars`);
  }

  const directoryTree = buildDirectoryTree(
    snapshot,
    needRebuild ? null : detectChanges(snapshot, base!),
  );
  const queryTurn = buildQueryTurn(directoryTree, query, scope, fileTypes);

  const systemInstructions = getSystemInstructions();
  const messages: { role: "user"; content: string }[] = [
    { role: "user", content: systemInstructions },
    { role: "user", content: baseContext },
  ];
  if (changeContext) {
    messages.push({ role: "user", content: changeContext });
  }
  messages.push({ role: "user", content: queryTurn });
  info(`sending query: ${messages.length} messages`);

  const response = await sendQuery(messages);
  info(`query result: ${response.results.length} results, output=${response.usage.completion_tokens} tokens`);

  if (response.results.length > 0) {
    for (const r of response.results) {
      info(`  result: ${r.file}:${r.start_line}-${r.end_line}`);
    }
  }

  if (needRebuild) {
    const fileHashes: Record<string, string> = {};
    for (const [filePath, entry] of snapshot) {
      fileHashes[filePath] = entry.hash;
    }

    const newBase: BaseData = {
      base_token_count: response.usage.prompt_tokens,
      base_request_text: baseContext,
      file_hashes: fileHashes,
      timestamp: Date.now(),
    };

    await withLock(workspaceRoot, async () => {
      writeBase(workspaceRoot, newBase);
    });
    info(`base saved: ${Object.keys(fileHashes).length} files`);
  }

  const output = extractResults(snapshot, response.results, config.max_output_chars);
  info(`--- query end: returned ${output.length} chars ---`);
  return { content: [{ type: "text", text: output }] };
}

// --- Multi-shard path ---

interface ShardState {
  entry: ShardEntry;
  base: BaseData | null;
  needRebuild: boolean;
  baseContext: string;
  changeContext: string;
}

async function handleShardedQuery(
  snapshot: Snapshot,
  plan: ShardPlan,
  storedMeta: ShardMeta | null,
  query: string,
  scope?: string,
  fileTypes?: string[],
): Promise<CallToolResult> {
  const planChanged = !storedMeta || storedMeta.planHash !== plan.planHash;
  if (planChanged) {
    info(`shard plan changed (stored=${storedMeta?.planHash ?? "none"}, current=${plan.planHash})`);
  }

  const shardStates: ShardState[] = plan.shards.map((entry) => ({
    entry,
    base: planChanged ? null : readShardBase(workspaceRoot, entry.id),
    needRebuild: planChanged,
    baseContext: "",
    changeContext: "",
  }));

  for (const state of shardStates) {
    if (state.needRebuild) {
      state.baseContext = buildShardBaseContext(workspaceRoot, snapshot, state.entry.files);
      info(`shard "${state.entry.id}": rebuild, ${state.baseContext.length} chars`);
    } else if (state.base) {
      const shardSnapshot = filterSnapshot(snapshot, state.entry.files);
      const changes = detectChanges(shardSnapshot, state.base);
      if (changes.changeTokenRatio > config.change_threshold) {
        info(`shard "${state.entry.id}": change ratio ${changes.changeTokenRatio.toFixed(4)} exceeds threshold, rebuilding`);
        state.needRebuild = true;
        state.baseContext = buildShardBaseContext(workspaceRoot, snapshot, state.entry.files);
      } else {
        state.baseContext = state.base.base_request_text;
        state.changeContext = buildChangeContext(shardSnapshot, changes);
        if (state.changeContext) {
          info(`shard "${state.entry.id}": incremental, ${state.changeContext.length} chars change`);
        }
      }
    }
  }

  const directoryTree = buildDirectoryTree(snapshot, null);
  const systemInstructions = getShardedSystemInstructions();

  const querySets = shardStates.map((state) => {
    const queryTurn = buildQueryTurn(directoryTree, query, scope, fileTypes, {
      id: state.entry.id,
      totalShards: plan.shards.length,
    });

    const messages: { role: "user"; content: string }[] = [
      { role: "user", content: systemInstructions },
      { role: "user", content: state.baseContext },
    ];
    if (state.changeContext) {
      messages.push({ role: "user", content: state.changeContext });
    }
    messages.push({ role: "user", content: queryTurn });

    return { shardId: state.entry.id, messages };
  });

  info(`sending parallel queries to ${querySets.length} shards`);
  const responses = await sendParallelQueries(querySets);

  for (const { shardId, response } of responses) {
    const hitPct = response.usage.prompt_tokens > 0
      ? ((response.usage.prompt_cache_hit_tokens / response.usage.prompt_tokens) * 100).toFixed(1)
      : "0";
    info(`shard "${shardId}": ${response.results.length} results, hit=${hitPct}%`);
  }

  const mergedResults = mergeShardResults(responses.map((r) => r.response.results));
  info(`merged: ${mergedResults.length} total results`);

  const queryTimestamp = Date.now();
  await withLock(workspaceRoot, async () => {
    const newMeta: ShardMeta = {
      planHash: plan.planHash,
      shards: plan.shards.map((s) => ({ id: s.id, prefix: s.prefix })),
      timestamp: queryTimestamp,
    };
    writeShardMeta(workspaceRoot, newMeta);

    for (let i = 0; i < shardStates.length; i++) {
      const state = shardStates[i];
      if (!state.needRebuild) continue;

      const matchingResponse = responses.find((r) => r.shardId === state.entry.id);
      if (!matchingResponse) continue;

      const fileHashes: Record<string, string> = {};
      for (const filePath of state.entry.files) {
        const entry = snapshot.get(filePath);
        if (entry) fileHashes[filePath] = entry.hash;
      }

      const newBase: BaseData = {
        base_token_count: matchingResponse.response.usage.prompt_tokens,
        base_request_text: state.baseContext,
        file_hashes: fileHashes,
        timestamp: queryTimestamp,
      };
      writeShardBase(workspaceRoot, state.entry.id, newBase);
    }

    cleanupShardFiles(workspaceRoot, plan.shards.map((s) => s.id));
  });

  const output = extractResults(snapshot, mergedResults, config.max_output_chars);
  info(`--- query end: returned ${output.length} chars ---`);
  return { content: [{ type: "text", text: output }] };
}

function filterSnapshot(snapshot: Snapshot, files: string[]): Snapshot {
  const filtered: Snapshot = new Map();
  for (const f of files) {
    const entry = snapshot.get(f);
    if (entry) filtered.set(f, entry);
  }
  return filtered;
}

function mergeShardResults(resultSets: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const results of resultSets) {
    for (const r of results) {
      const key = `${r.file}:${r.start_line}:${r.end_line}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(r);
      }
    }
  }

  return merged;
}

// --- Initialization ---

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  try {
    const { roots } = await server.server.listRoots();
    if (roots.length > 0) {
      const uri = roots[0].uri;
      workspaceRoot = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
    }
  } catch {}

  if (!workspaceRoot) {
    workspaceRoot = process.cwd();
  }

  config = loadConfig();

  initLogger(workspaceRoot);
  initTokenizer();
  initDeepSeek(config);

  info(`workspace: ${workspaceRoot}`);
  info(`model: ${config.model}, effort: ${config.reasoning_effort}`);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
