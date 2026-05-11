import OpenAI from "openai";
import type { FlashlightConfig } from "./config.js";
import { info, warn, error } from "./logger.js";

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

export function initDeepSeek(cfg: FlashlightConfig): void {
  config = cfg;
  client = new OpenAI({
    apiKey: cfg.deepseek_api_key,
    baseURL: "https://api.deepseek.com",
  });
}

export async function sendQuery(
  messages: { role: "user"; content: string }[],
  label = "__default__",
): Promise<QueryResponse> {
  const stream = await client.chat.completions.create({
    model: config.model,
    messages,
    tools: [SEARCH_TOOL],
    stream: true,
    stream_options: { include_usage: true },
    // @ts-expect-error DeepSeek-specific: reasoning_effort + thinking
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

  const hitTokens: number = usage.prompt_cache_hit_tokens ?? 0;
  const hitPct = usage.prompt_tokens > 0
    ? ((hitTokens / usage.prompt_tokens) * 100).toFixed(1)
    : "0";
  info(`[${label}] cache: total=${usage.prompt_tokens} hit=${hitTokens} (${hitPct}%) miss=${usage.prompt_cache_miss_tokens ?? 0}`);

  info(`stream: ${chunkCount} chunks, toolArgs=${toolArgs.length} chars, content=${content.length} chars`);
  if (content && !toolArgs) {
    warn(`model returned content instead of tool call: ${content.slice(0, 200)}`);
  }

  let results: SearchResult[];
  if (!toolArgs) {
    if (content) {
      info("no tool call, retrying with JSON output mode");
      results = await retryWithJsonMode(messages, usage);
    } else {
      warn("no tool call and no content in response");
      results = [];
    }
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

async function retryWithJsonMode(
  messages: { role: "user"; content: string }[],
  originalUsage: any,
): Promise<SearchResult[]> {
  try {
    const retryMessages = [
      ...messages,
      { role: "user" as const, content: '请以JSON格式输出搜索结果，格式为 {"results": [{"file": "path", "start_line": 1, "end_line": 10}, ...]}。如果没有找到相关代码，输出 {"results": []}' },
    ];

    const resp = await client.chat.completions.create({
      model: config.model,
      messages: retryMessages,
      response_format: { type: "json_object" },
      // @ts-expect-error DeepSeek-specific
      thinking: { type: "disabled" },
    });

    const text = resp.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    const results: SearchResult[] = Array.isArray(parsed.results) ? parsed.results : [];
    info(`JSON retry: got ${results.length} results`);
    return results;
  } catch (err) {
    warn(`JSON retry failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export async function sendParallelQueries(
  querySets: { shardId: string; messages: { role: "user"; content: string }[] }[],
): Promise<{ shardId: string; response: QueryResponse }[]> {
  const results = await Promise.allSettled(
    querySets.map(async ({ shardId, messages }) => {
      const response = await sendQuery(messages, shardId);
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
