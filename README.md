# Flashlight

MCP Server that uses DeepSeek's 1M context window for whole-codebase code search.

## How it works

Flashlight loads your entire codebase into DeepSeek's context, then uses LLM understanding to find relevant code — no embeddings, no keyword matching, just brute-force full-context search.

It relies on DeepSeek's prefix caching for repeat queries: as long as the same prefix (system instructions + base code) is sent, tokens are served from cache (¥0.02/million tokens vs ¥1/million tokens for miss).

For large projects exceeding the 1M token limit, Flashlight automatically shards the codebase by directory, queries all shards in parallel, and merges results.

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

### Output

Results are returned as code snippets — the matched line ranges with line numbers.

## Configuration

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | (required) | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek API base URL |
| `FLASHLIGHT_MODEL` | `deepseek-v4-flash` | Model (`deepseek-v4-flash` or `deepseek-v4-pro`) |
| `FLASHLIGHT_REASONING_EFFORT` | `max` | Thinking effort (`high` or `max`) |
| `FLASHLIGHT_CHANGE_THRESHOLD` | `0.1` | Ratio of changed tokens to trigger base rebuild |
| `FLASHLIGHT_MAX_CONTEXT_TOKENS` | `900000` | Max tokens per shard (triggers auto-sharding when exceeded) |

### Project-level config

Create `.flashlight/config.json` in the workspace root to customize file extensions per project:

```json
{
  "ext_whitelist": [".mdx", ".astro"],
  "ext_whitelist_override": false
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `ext_whitelist` | `[]` | File extensions to include |
| `ext_whitelist_override` | `false` | `true` = only index listed extensions; `false` = merge with global defaults |

**Priority:** project config > `FLASHLIGHT_EXT_WHITELIST` env var > built-in defaults.

The config is read once at process start. Changes require restarting the agent environment.

## How caching works

Flashlight relies on DeepSeek's prefix caching. On first query, it sends all code and saves a base snapshot. On subsequent queries:

1. Detect file changes against the saved base
2. If changed tokens exceed `FLASHLIGHT_CHANGE_THRESHOLD` (default 10%) — rebuild the base entirely
3. Otherwise — reuse the stored base text and append only changed files as incremental context

This ensures the prompt prefix stays stable across queries, maximizing cache hit rate.

## Sharding (large projects)

When a project exceeds `FLASHLIGHT_MAX_CONTEXT_TOKENS`, Flashlight automatically:

1. Splits files by directory — tries the whole project first, then recursively splits by top-level directories until each group fits
2. Queries all shards in parallel
3. Merges and deduplicates results

Each shard maintains independent cache state. Shard boundaries only change when a shard overflows (split eagerly, merge lazily).

## Logs

Logs are written to `.flashlight/flashlight.log` in the workspace root. Each query logs:
- Snapshot size and shard plan
- File change detection
- Per-shard query cache hit ratio
- Search results

## Cost

With `deepseek-v4-flash` on a ~50K token codebase:

| Operation | Cost |
|-----------|------|
| First query (build cache) | ~¥0.05 |
| Subsequent query (cache hit) | ~¥0.001 + output tokens |

## License

ISC
