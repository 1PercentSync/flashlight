import OpenAI from "openai";

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
      { role: "user", content: "cache probe, reply OK" },
    ],
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
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "disabled" },
  });

  const usage = resp.usage!;
  // @ts-expect-error DeepSeek-specific
  const hitTokens: number = usage.prompt_cache_hit_tokens ?? 0;

  return { hitTokens, totalTokens: usage.prompt_tokens };
}
