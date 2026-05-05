# openai (Node.js SDK)

Version: ^6.36.0

Used to call DeepSeek API via OpenAI-compatible format.

---

## Client Initialization

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-...",
  baseURL: "https://api.deepseek.com",
});
```

---

## Streaming Chat Completion

```typescript
const stream = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages: [
    { role: "user", content: "Hello" },
  ],
  stream: true,
  stream_options: { include_usage: true },
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  if (delta?.content) {
    // Collect content
  }
  // Final chunk has usage info
  if (chunk.usage) {
    console.log(chunk.usage.prompt_tokens);
  }
}
```

---

## JSON Output Mode

```typescript
const response = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages: [
    { role: "system", content: "Output json. Example: {\"key\": \"value\"}" },
    { role: "user", content: "..." },
  ],
  response_format: { type: "json_object" },
});

const data = JSON.parse(response.choices[0].message.content!);
```

---

## Passing DeepSeek-specific Parameters

DeepSeek `thinking` parameter is not in the OpenAI spec. Pass it directly in the request body — the SDK sends unknown properties as-is:

```typescript
const stream = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages,
  stream: true,
  stream_options: { include_usage: true },
  response_format: { type: "json_object" },
  reasoning_effort: "high",
  // @ts-expect-error DeepSeek-specific parameter
  thinking: { type: "enabled" },
});
```

---

## Reading reasoning_content from Stream

DeepSeek returns thinking content via `reasoning_content` field on delta (not in OpenAI spec):

```typescript
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  // @ts-expect-error DeepSeek-specific field
  const reasoning = delta?.reasoning_content as string | undefined;
  const content = delta?.content;

  // Project discards reasoning, only collects content
  if (content) {
    result += content;
  }
}
```

---

## Usage Fields (DeepSeek)

Available in non-stream response or final stream chunk (with `include_usage: true`):

```typescript
// @ts-expect-error DeepSeek-specific fields
const { prompt_cache_hit_tokens, prompt_cache_miss_tokens } = chunk.usage;
```

Standard fields:
- `usage.prompt_tokens` — total input tokens
- `usage.completion_tokens` — total output tokens
- `usage.total_tokens` — sum of above

DeepSeek extensions:
- `usage.prompt_cache_hit_tokens` — cache hit portion
- `usage.prompt_cache_miss_tokens` — cache miss portion
- `usage.completion_tokens_details.reasoning_tokens` — thinking chain tokens

---

## Key Points

- `baseURL` (not `base_url`) in the Node.js SDK
- Unknown body parameters are sent as-is (use `// @ts-expect-error` for TypeScript)
- Stream is `AsyncIterable<ChatCompletionChunk>`
- With `stream_options: { include_usage: true }`, the last chunk before `[DONE]` includes `usage`
