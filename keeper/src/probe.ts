import OpenAI from "openai";

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

export interface ProbeResult {
  alive: boolean;
  hitTokens: number;
  totalTokens: number;
}

export async function probe(
  apiKey: string,
  model: string,
  firstTurnText: string,
): Promise<ProbeResult> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });

  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "user", content: firstTurnText },
      { role: "user", content: "直接回复OK" },
    ],
    tools: [SEARCH_TOOL],
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "disabled" },
  });

  const usage = resp.usage!;
  // @ts-expect-error DeepSeek-specific
  const hitTokens: number = usage.prompt_cache_hit_tokens ?? 0;

  return {
    alive: hitTokens > 0,
    hitTokens,
    totalTokens: usage.prompt_tokens,
  };
}

export async function activate(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<{ hitTokens: number; totalTokens: number }> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });

  const resp = await client.chat.completions.create({
    model,
    messages: messages as any,
    tools: [SEARCH_TOOL],
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "disabled" },
  });

  const usage = resp.usage!;
  // @ts-expect-error DeepSeek-specific
  const hitTokens: number = usage.prompt_cache_hit_tokens ?? 0;

  return { hitTokens, totalTokens: usage.prompt_tokens };
}
