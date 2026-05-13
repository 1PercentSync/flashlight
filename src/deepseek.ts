import OpenAI from "openai";
import type { FlashlightConfig } from "./config.js";
import { info, warn, error } from "./logger.js";

/** A single code location returned by the model. */
export interface SearchResult {
  /** Relative file path. */
  file: string;
  /** Start line number (1-based). */
  start_line: number;
  /** End line number (1-based, inclusive). */
  end_line: number;
}

/** Response from a DeepSeek query, including search results and token usage. */
export interface QueryResponse {
  results: SearchResult[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_cache_hit_tokens: number;
    prompt_cache_miss_tokens: number;
    reasoning_tokens: number;
  };
  error?: string;
}

const SEARCH_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "report_search_results",
    strict: true,
    description: "MUST be called as the first and only response. All responses MUST be tool calls to this function. Never respond with plain text.",
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

const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

let client: OpenAI;
let config: FlashlightConfig;

let totalPromptTokens = 0;
let totalHitTokens = 0;

/** Initialize the DeepSeek API client. Must be called before any queries. */
export function initDeepSeek(cfg: FlashlightConfig): void {
  config = cfg;
  client = new OpenAI({
    apiKey: cfg.deepseek_api_key,
    baseURL: cfg.base_url,
  });
}

/**
 * Send a streaming query to DeepSeek with retry logic.
 * Retries up to 3 times for: no tool call responses, and retryable API errors (429/500/503).
 * Non-retryable API errors (400/401/402/422) fail immediately.
 * On final failure, returns a QueryResponse with an error field instead of throwing.
 * @param label - Identifier for logging (shard ID or "__default__").
 */
export async function sendQuery(
  messages: { role: "user"; content: string }[],
  label = "__default__",
): Promise<QueryResponse> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await executeQuery(messages, label);
      if (response) return response;
      if (attempt < MAX_RETRIES) {
        const delay = getBackoffDelay(attempt);
        warn(`[${label}] no tool call in response, retrying (${attempt}/${MAX_RETRIES}) after ${delay}ms`);
        await sleep(delay);
      }
    } catch (err) {
      const statusCode = getStatusCode(err);
      const errMsg = err instanceof Error ? err.message : String(err);

      if (statusCode !== null && !RETRYABLE_STATUS_CODES.has(statusCode)) {
        error(`[${label}] non-retryable API error (${statusCode}): ${errMsg}`);
        return makeErrorResponse(`API error ${statusCode}: ${errMsg}`);
      }

      if (attempt < MAX_RETRIES) {
        const delay = getBackoffDelay(attempt);
        warn(`[${label}] retryable error (${statusCode ?? "unknown"}): ${errMsg}, retrying (${attempt}/${MAX_RETRIES}) after ${delay}ms`);
        await sleep(delay);
      } else {
        error(`[${label}] failed after ${MAX_RETRIES} attempts: ${errMsg}`);
        return makeErrorResponse(`Failed after ${MAX_RETRIES} retries: ${errMsg}`);
      }
    }
  }

  return makeErrorResponse(`[${label}] no tool call after ${MAX_RETRIES} attempts`);
}

/**
 * Execute a single query attempt. Returns QueryResponse on success (tool call parsed),
 * null if model didn't produce a tool call, or throws on API error.
 */
async function executeQuery(
  messages: { role: "user"; content: string }[],
  label: string,
): Promise<QueryResponse | null> {
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
  const missTokens: number = usage.prompt_cache_miss_tokens ?? 0;
  const completionTokens: number = usage.completion_tokens ?? 0;
  const reasoningTokens: number = usage.completion_tokens_details?.reasoning_tokens ?? 0;
  const hitPct = usage.prompt_tokens > 0
    ? ((hitTokens / usage.prompt_tokens) * 100).toFixed(1)
    : "0";
  totalPromptTokens += usage.prompt_tokens;
  totalHitTokens += hitTokens;
  const avgHitPct = totalPromptTokens > 0
    ? ((totalHitTokens / totalPromptTokens) * 100).toFixed(1)
    : "0";
  info(`[${label}] usage: prompt=${usage.prompt_tokens} (hit=${hitTokens} ${hitPct}%, miss=${missTokens}), completion=${completionTokens} (reasoning=${reasoningTokens})`);
  info(`[session] cumulative cache hit rate: ${avgHitPct}% (${totalHitTokens}/${totalPromptTokens} tokens)`);
  info(`stream: ${chunkCount} chunks, toolArgs=${toolArgs.length} chars, content=${content.length} chars`);

  if (!toolArgs) {
    if (content) {
      warn(`[${label}] model returned content instead of tool call: ${content.slice(0, 200)}`);
    } else {
      warn(`[${label}] no tool call and no content in response`);
    }
    return null;
  }

  let results: SearchResult[];
  try {
    const parsed = JSON.parse(toolArgs);
    results = Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    throw new Error(`Failed to parse tool call arguments: ${toolArgs.slice(0, 200)}`);
  }

  return {
    results,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: completionTokens,
      prompt_cache_hit_tokens: hitTokens,
      prompt_cache_miss_tokens: missTokens,
      reasoning_tokens: reasoningTokens,
    },
  };
}

/** Send queries to multiple shards in parallel. Returns all results (including failed ones with error field). */
export async function sendParallelQueries(
  querySets: { shardId: string; messages: { role: "user"; content: string }[] }[],
): Promise<{ shardId: string; response: QueryResponse }[]> {
  const results = await Promise.allSettled(
    querySets.map(async ({ shardId, messages }) => {
      const response = await sendQuery(messages, shardId);
      return { shardId, response };
    }),
  );

  const responses: { shardId: string; response: QueryResponse }[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      responses.push(result.value);
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      error(`shard "${querySets[i].shardId}" unexpected failure: ${errMsg}`);
      responses.push({
        shardId: querySets[i].shardId,
        response: makeErrorResponse(errMsg),
      });
    }
  }

  return responses;
}

function makeErrorResponse(errorMsg: string): QueryResponse {
  return {
    results: [],
    usage: { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0, reasoning_tokens: 0 },
    error: errorMsg,
  };
}

function getBackoffDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** (attempt - 1), 8000);
  const jitter = Math.random() * base * 0.5;
  return Math.round(base + jitter);
}

function getStatusCode(err: unknown): number | null {
  if (err && typeof err === "object" && "status" in err && typeof (err as any).status === "number") {
    return (err as any).status;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
