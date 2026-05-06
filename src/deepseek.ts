import OpenAI from "openai";
import type { FlashlightConfig } from "./config.js";
import { logCacheResult, info, warn, error } from "./logger.js";

export interface SearchResult {
  file: string;
  start_line: number;
  end_line: number;
}

export interface QueryResponse {
  results: SearchResult[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_cache_hit_tokens: number;
    prompt_cache_miss_tokens: number;
  };
}

interface CacheUnit {
  position: number;
  timestamp: number;
}

const SEARCH_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "report_search_results",
    strict: true,
    description: "Report code search results matching the query",
    parameters: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string", description: "Relative file path" },
              start_line: { type: "integer", description: "Start line number (1-based)" },
              end_line: { type: "integer", description: "End line number (1-based)" },
            },
            required: ["file", "start_line", "end_line"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
      additionalProperties: false,
    },
  },
};

let client: OpenAI;
let config: FlashlightConfig;
let cacheUnits: CacheUnit[] = [];

export function initDeepSeek(cfg: FlashlightConfig): void {
  config = cfg;
  client = new OpenAI({
    apiKey: cfg.deepseek_api_key,
    baseURL: "https://api.deepseek.com",
  });
}

export async function probeCache(firstTurnText: string): Promise<{
  alive: boolean;
  hitTokens: number;
}> {
  const messages = [
    { role: "user" as const, content: firstTurnText },
    { role: "user" as const, content: "当前是测试缓存是否依旧生效,直接回复OK" },
  ];

  const resp = await client.chat.completions.create({
    model: config.model,
    messages,
    tools: [SEARCH_TOOL],
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "disabled" },
  });

  const usage = resp.usage!;
  // @ts-expect-error DeepSeek-specific
  const hitTokens: number = usage.prompt_cache_hit_tokens ?? 0;

  const predicted = predictCacheHit(usage.prompt_tokens);
  logCacheResult({
    type: "probe",
    totalTokens: usage.prompt_tokens,
    predictedHit: predicted,
    actualHit: hitTokens,
  });

  recordCacheUnit(usage.prompt_tokens);

  return { alive: hitTokens > 0, hitTokens };
}

export async function sendQuery(
  messages: { role: "user"; content: string }[],
): Promise<QueryResponse> {
  const stream = await client.chat.completions.create({
    model: config.model,
    messages,
    tools: [SEARCH_TOOL],
    stream: true,
    stream_options: { include_usage: true },
    // @ts-expect-error DeepSeek-specific: reasoning_effort "max" + thinking
    reasoning_effort: config.reasoning_effort,
    thinking: { type: "enabled" },
  });

  let toolArgs = "";
  let content = "";
  let usage: any = null;
  let chunkCount = 0;

  for await (const chunk of stream) {
    chunkCount++;
    const delta = chunk.choices[0]?.delta;
    if (delta?.tool_calls?.[0]?.function?.arguments) {
      toolArgs += delta.tool_calls[0].function.arguments;
    }
    if (delta?.content) content += delta.content;
    if (chunk.usage) usage = chunk.usage;
  }

  if (!usage) throw new Error("No usage data in stream response");

  info(`stream: ${chunkCount} chunks, toolArgs=${toolArgs.length} chars, content=${content.length} chars`);
  if (content && !toolArgs) {
    warn(`model returned content instead of tool call: ${content.slice(0, 200)}`);
  }

  const hitTokens: number = usage.prompt_cache_hit_tokens ?? 0;
  const predicted = predictCacheHit(usage.prompt_tokens);
  logCacheResult({
    type: "query",
    totalTokens: usage.prompt_tokens,
    predictedHit: predicted,
    actualHit: hitTokens,
  });

  recordCacheUnit(usage.prompt_tokens);

  let results: SearchResult[];
  if (!toolArgs) {
    warn("no tool call in response, returning empty results");
    results = [];
  } else {
    try {
      const parsed = JSON.parse(toolArgs);
      results = Array.isArray(parsed.results) ? parsed.results : [];
    } catch {
      throw new Error(`Failed to parse tool call arguments: ${toolArgs.slice(0, 200)}`);
    }
  }

  return {
    results,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      prompt_cache_hit_tokens: hitTokens,
      prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens ?? 0,
    },
  };
}

export async function sendActivation(
  messages: { role: "user"; content: string }[],
  label: string,
): Promise<void> {
  try {
    const resp = await client.chat.completions.create({
      model: config.model,
      messages,
      tools: [SEARCH_TOOL],
      // @ts-expect-error DeepSeek-specific
      thinking: { type: "disabled" },
    });
    const usage = resp.usage!;
    // @ts-expect-error DeepSeek-specific
    const hitTokens: number = usage.prompt_cache_hit_tokens ?? 0;
    const predicted = predictCacheHit(usage.prompt_tokens);
    logCacheResult({
      type: "activation",
      totalTokens: usage.prompt_tokens,
      predictedHit: predicted,
      actualHit: hitTokens,
    });
    recordCacheUnit(usage.prompt_tokens);
    info(`${label} activation completed`);
  } catch (err) {
    error(`${label} activation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function fireActivation(
  messages: { role: "user"; content: string }[],
  label: string,
): void {
  sendActivation(messages, label).catch(() => {});
}

export async function sendParallelQueries(
  querySets: { shardId: string; messages: { role: "user"; content: string }[] }[],
): Promise<{ shardId: string; response: QueryResponse }[]> {
  const results = await Promise.allSettled(
    querySets.map(async ({ shardId, messages }) => {
      const response = await sendQuery(messages);
      return { shardId, response };
    }),
  );

  const successful: { shardId: string; response: QueryResponse }[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      error(`shard query failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  }

  if (successful.length === 0 && querySets.length > 0) {
    throw new Error("All shard queries failed");
  }

  return successful;
}

export function clearCacheUnits(): void {
  cacheUnits = [];
}

function predictCacheHit(totalPromptTokens: number): number {
  let bestMatch = 0;
  for (const unit of cacheUnits) {
    if (unit.position <= totalPromptTokens && unit.position > bestMatch) {
      bestMatch = unit.position;
    }
  }
  return bestMatch;
}

function recordCacheUnit(totalPromptTokens: number): void {
  const position = Math.floor(totalPromptTokens / 128) * 128;
  if (position === 0) return;
  const exists = cacheUnits.some((u) => u.position === position);
  if (!exists) {
    cacheUnits.push({ position, timestamp: Date.now() });
  }
}
