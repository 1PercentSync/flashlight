#!/usr/bin/env node
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadConfig, type FlashlightConfig } from "./config.js";
import { initTokenizer, countTokens } from "./tokenizer.js";
import { withLock } from "./lock.js";
import { createSnapshot, type Snapshot } from "./scanner.js";
import { readBase, writeBase, detectChanges, type BaseData } from "./base.js";
import {
  generateCacheKey,
  buildFirstTurn,
  buildBaseContext,
  buildChangeContext,
  buildDirectoryTree,
  buildQueryTurn,
} from "./context.js";
import { initDeepSeek, probeCache, sendQuery, sendActivation, fireActivation, clearCacheUnits } from "./deepseek.js";
import { extractResults } from "./extractor.js";
import { initLogger, info, error } from "./logger.js";

const server = new McpServer({ name: "flashlight", version: "0.1.0" });
let config: FlashlightConfig;
let workspaceRoot: string;

server.registerTool(
  "search",
  {
    description: "Search code in the workspace using DeepSeek's 1M context window",
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

  const snapshot = createSnapshot(workspaceRoot, config);
  info(`snapshot: ${snapshot.size} files`);

  const base = await withLock(workspaceRoot, async () => readBase(workspaceRoot));

  let needRebuild = false;
  let firstTurnText = "";
  let baseContext = "";
  let changeContext = "";

  if (!base) {
    info("no base.json found, rebuilding");
    needRebuild = true;
  } else {
    info(`base loaded: ${Object.keys(base.file_hashes).length} files, ${base.base_token_count} tokens, key=${base.first_turn_text.slice(0, 32)}...`);
    firstTurnText = base.first_turn_text;

    const probeResult = await probeCache(firstTurnText);
    if (!probeResult.alive) {
      info("cache probe: miss, rebuilding base");
      needRebuild = true;
    } else {
      info(`cache probe: hit (${probeResult.hitTokens} tokens)`);

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
  }

  if (needRebuild) {
    clearCacheUnits();
    const cacheKey = generateCacheKey();
    firstTurnText = buildFirstTurn(cacheKey);
    baseContext = buildBaseContext(workspaceRoot, snapshot);
    info(`rebuild: new key=${cacheKey}, base context=${baseContext.length} chars`);
  }

  const directoryTree = buildDirectoryTree(
    snapshot,
    needRebuild ? null : detectChanges(snapshot, base!),
  );
  const queryTurn = buildQueryTurn(directoryTree, query, scope, fileTypes);

  const messages: { role: "user"; content: string }[] = [
    { role: "user", content: firstTurnText },
    { role: "user", content: baseContext },
  ];
  if (changeContext) {
    messages.push({ role: "user", content: changeContext });
  }
  messages.push({ role: "user", content: queryTurn });
  info(`sending query: ${messages.length} messages`);

  const response = await sendQuery(messages);
  const hitPct = response.usage.prompt_tokens > 0
    ? ((response.usage.prompt_cache_hit_tokens / response.usage.prompt_tokens) * 100).toFixed(1)
    : "0";
  info(`query result: ${response.results.length} results, prompt=${response.usage.prompt_tokens}, hit=${response.usage.prompt_cache_hit_tokens} (${hitPct}%), miss=${response.usage.prompt_cache_miss_tokens}, output=${response.usage.completion_tokens}`);

  if (response.results.length > 0) {
    for (const r of response.results) {
      info(`  result: ${r.file}:${r.start_line}-${r.end_line}`);
    }
  }

  if (needRebuild) {
    const queryTimestamp = Date.now();
    const fileHashes: Record<string, string> = {};
    for (const [filePath, entry] of snapshot) {
      fileHashes[filePath] = entry.hash;
    }

    const newBase: BaseData = {
      first_turn_text: firstTurnText,
      first_turn_token_count: countTokens(firstTurnText),
      base_token_count: response.usage.prompt_tokens,
      base_request_text: baseContext,
      file_hashes: fileHashes,
      timestamp: queryTimestamp,
    };

    await withLock(workspaceRoot, async () => {
      writeBase(workspaceRoot, newBase);
    });
    info(`base saved: ${Object.keys(fileHashes).length} files, first_turn_tokens=${newBase.first_turn_token_count}`);

    info("sending short activation (await)");
    await sendActivation(
      [{ role: "user", content: firstTurnText }, { role: "user", content: "OK" }],
      "short",
    );
    info("sending base activation (fire-and-forget)");
    fireActivation(
      [{ role: "user", content: firstTurnText }, { role: "user", content: baseContext }, { role: "user", content: "OK" }],
      "base",
    );
  }

  info("sending changes activation (fire-and-forget)");
  fireActivation(
    messages.map((m) => ({ ...m })).slice(0, -1).concat({ role: "user", content: "OK" }),
    "changes",
  );

  const output = extractResults(snapshot, response.results);
  info(`--- query end: returned ${output.length} chars ---`);
  return { content: [{ type: "text", text: output }] };
}

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

  config = loadConfig({
    deepseek_api_key: process.env.DEEPSEEK_API_KEY,
    model: process.env.FLASHLIGHT_MODEL,
    reasoning_effort: process.env.FLASHLIGHT_REASONING_EFFORT,
    change_threshold: process.env.FLASHLIGHT_CHANGE_THRESHOLD
      ? parseFloat(process.env.FLASHLIGHT_CHANGE_THRESHOLD)
      : undefined,
  });

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
