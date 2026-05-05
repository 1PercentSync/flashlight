# DeepSeek API Reference (Flashlight Project)

本文档仅提炼 Flashlight 项目实际需要的 DeepSeek API 信息。完整文档见 `deepseek-full.md`。

---

## 1. API Basics

| Item | Value |
|------|-------|
| Base URL (OpenAI format) | `https://api.deepseek.com` |
| Auth | Bearer Token (API Key) |
| Endpoint | `POST /chat/completions` |
| SDK | `openai` npm package (OpenAI compatible) |

Models:

| Model ID | Notes |
|----------|-------|
| `deepseek-v4-flash` | Default, supports thinking mode |
| `deepseek-v4-pro` | Higher quality, supports thinking mode |

> `deepseek-chat` and `deepseek-reasoner` will be deprecated. For compatibility, they map to `deepseek-v4-flash` non-thinking and thinking mode respectively.

---

## 2. Pricing (per million tokens)

| Item | deepseek-v4-flash | deepseek-v4-pro |
|------|-------------------|-----------------|
| Input (cache hit) | ¥0.02 | ¥0.025 |
| Input (cache miss) | ¥1 | ¥3 |
| Output | ¥2 | ¥6 |

Context length: 1M tokens. Max output: 384K tokens.

---

## 3. Thinking Mode

Default enabled. Control via `extra_body` in OpenAI SDK:

```python
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=messages,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}},
)
```

| Parameter | Values | Notes |
|-----------|--------|-------|
| `thinking.type` | `enabled` / `disabled` | Default: `enabled` |
| `reasoning_effort` | `high` / `max` | Default: `high`. `low`/`medium` map to `high`, `xhigh` maps to `max` |

Thinking mode restrictions:
- `temperature`, `top_p`, `presence_penalty`, `frequency_penalty` are **ignored** (no error, just no effect)

### reasoning_content Handling

- Non-streaming: `response.choices[0].message.reasoning_content`
- Streaming: `chunk.choices[0].delta.reasoning_content`

Multi-turn rules:
- If no tool calls between user messages: `reasoning_content` from assistant **can be omitted** in subsequent turns (ignored by API)
- If tool calls occurred: `reasoning_content` **must be passed back** to API in all subsequent turns

---

## 4. JSON Output

```python
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=messages,
    response_format={'type': 'json_object'},
)
```

Requirements:
1. System or user prompt **must contain** the word `json` and provide a format example
2. Set `max_tokens` appropriately to prevent truncation
3. API may occasionally return empty `content` (retry with modified prompt)

---

## 5. Streaming

```python
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=messages,
    stream=True,
    stream_options={"include_usage": True},
)
```

Stream chunk structure (`delta`):
- `delta.role`: `"assistant"` (first chunk only)
- `delta.reasoning_content`: thinking content (when in thinking mode)
- `delta.content`: final answer content
- `finish_reason`: `null` until done, then `"stop"` / `"length"` / etc.

With `include_usage: true`, the final chunk before `data: [DONE]` includes `usage` field.

---

## 6. Context Caching

Auto-enabled for all users. No code changes needed.

### How It Works

- **Prefix matching**: requests sharing an identical token prefix from the start will hit cache
- Cache build time: seconds
- Cache TTL: not fixed, empirically ~700 minutes, estimated ~6 hours

### Cache Build Rules

1. **Request boundaries**: cache checkpoints at user input end and model output end
2. **Common prefix detection**: when multiple requests share a common prefix, it gets cached as an independent unit
3. **Fixed interval**: long inputs/outputs get checkpointed at regular token intervals

### Key Constraint

A request must **fully match** a cached prefix unit to hit cache. Partial matches don't count.

Example: if request 1 is `A + B` and request 2 is `A + C`, request 2 does NOT hit cache (can't fully match `A + B`). But after both complete, the system detects common prefix `A` and caches it. Request 3 with `A + D` will then hit on `A`.

### Verified Behavior (2026-05-05)

1. **Minimum threshold**: requests with total prompt < ~128 tokens never produce cache
2. **128-token alignment**: `prompt_cache_hit_tokens` is always a multiple of 128 (DS stores cache in 128-token blocks)
3. **No collision**: different text prefixes never cross-hit each other
4. **Activation required**: common prefix detection needs at least 2 requests with the same prefix before it creates a cache unit. First probe always returns 0; second probe can hit.

### Usage Fields

```json
{
  "usage": {
    "prompt_tokens": 100,
    "prompt_cache_hit_tokens": 80,
    "prompt_cache_miss_tokens": 20,
    "completion_tokens": 50,
    "total_tokens": 150,
    "completion_tokens_details": {
      "reasoning_tokens": 30
    }
  }
}
```

- `prompt_cache_hit_tokens`: tokens that hit cache
- `prompt_cache_miss_tokens`: tokens that missed cache
- `prompt_tokens` = `prompt_cache_hit_tokens` + `prompt_cache_miss_tokens`
- `reasoning_tokens`: thinking chain tokens (counted in `completion_tokens`)

---

## 7. Multi-turn Conversation

API is stateless. Full conversation history must be sent each request.

```python
messages = [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."},
    {"role": "user", "content": "..."},
]
```

---

## 8. Error Codes

| Code | Cause | Action |
|------|-------|--------|
| 400 | Malformed request body | Fix request format |
| 401 | Invalid API key | Check API key |
| 402 | Insufficient balance | Top up account |
| 422 | Invalid parameters | Fix parameters |
| 429 | Rate limit (TPM/RPM) | Reduce request rate |
| 500 | Server error | Retry later |
| 503 | Server overloaded | Retry later |

### finish_reason Values

| Value | Meaning |
|-------|---------|
| `stop` | Natural completion or hit stop sequence |
| `length` | Hit context limit or `max_tokens` |
| `content_filter` | Filtered by safety policy |
| `tool_calls` | Model wants to call a tool |
| `insufficient_system_resource` | Backend resource shortage, generation interrupted |

---

## 9. Request Template (Project-specific)

Based on design.md, the typical Flashlight request:

```typescript
const response = await openai.chat.completions.create({
  model: config.model, // "deepseek-v4-flash" or "deepseek-v4-pro"
  messages: [
    { role: "user", content: firstTurnText },    // cache key + system instructions
    { role: "user", content: baseContext },       // full workspace code
    { role: "user", content: changeContext },     // changed files
    { role: "user", content: directoryAndQuery }, // directory tree + query
  ],
  stream: true,
  stream_options: { include_usage: true },
  response_format: { type: "json_object" },
  reasoning_effort: config.reasoning_effort,
  extra_body: { thinking: { type: "enabled" } },
});
```

> NOTE: Whether consecutive `user` messages (without intermediate `assistant` replies) are supported needs verification. Fallback: insert `{ role: "assistant", content: "OK" }` between user messages.
