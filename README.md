# Flashlight

MCP Server that uses DeepSeek's 1M context window for whole-codebase code search.

## How it works

Flashlight loads your entire codebase into DeepSeek's context, then uses LLM understanding to find relevant code — no embeddings, no keyword matching, just brute-force full-context search.

It caches the codebase context on DeepSeek's side, so repeat queries are fast and cheap (cache hit price: ¥0.02/million tokens vs ¥1/million tokens for miss).

## Setup

### 1. Install

```bash
npm install -g @1percentsync/flashlight
```

### 2. Get a DeepSeek API key

Get one at [platform.deepseek.com](https://platform.deepseek.com/api_keys).

### 3. Configure MCP

Add to your MCP client config:

**Claude Code** (`~/.claude.json` under `mcpServers`):

```json
{
  "flashlight": {
    "command": "flashlight",
    "env": {
      "DEEPSEEK_API_KEY": "sk-..."
    }
  }
}
```

## Usage

The server exposes a single tool `search` with parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Natural language description of the code to find |
| `scope` | No | Relative directory path to narrow search |
| `file_types` | No | File extensions to filter (e.g. `[".ts", ".py"]`) |

## Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | (required) | DeepSeek API key |
| `FLASHLIGHT_MODEL` | `deepseek-v4-flash` | Model (`deepseek-v4-flash` or `deepseek-v4-pro`) |
| `FLASHLIGHT_REASONING_EFFORT` | `high` | Thinking effort (`high` or `max`) |
| `FLASHLIGHT_CHANGE_THRESHOLD` | `0.1` | Ratio of changed tokens to trigger base rebuild |

## How caching works

On first query, Flashlight sends all code to DeepSeek and saves a base snapshot. On subsequent queries:

1. **Probe** — check if DeepSeek's cache is still alive
2. **If alive** — detect file changes, send only changed files + new query
3. **If expired** — rebuild the base

After each rebuild, activation requests establish cache for future probes and queries.

## Logs

Logs are written to `.flashlight/flashlight.log` in the workspace root. Each query logs:
- Snapshot size
- Cache probe result (hit/miss)
- File change detection
- Query cache hit ratio
- Search results
- Activation status

## Cost

With `deepseek-v4-flash` on a ~50K token codebase:

| Operation | Cost |
|-----------|------|
| First query (build cache) | ~¥0.05 |
| Subsequent query (cache hit) | ~¥0.001 + output tokens |
| Activation (one-time after rebuild) | ~¥0.05 |

## License

ISC
