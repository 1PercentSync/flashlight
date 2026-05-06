# Flashlight

MCP Server that uses DeepSeek's 1M context window for whole-codebase code search.

## How it works

Flashlight loads your entire codebase into DeepSeek's context, then uses LLM understanding to find relevant code — no embeddings, no keyword matching, just brute-force full-context search.

It caches the codebase context on DeepSeek's side, so repeat queries are fast and cheap (cache hit price: ¥0.02/million tokens vs ¥1/million tokens for miss).

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

### Output Modes

Results are returned in one of three formats (tried in order):

1. **Full files** — all matched files with line numbers (if total ≤ 50K chars)
2. **Snippets** — only the matched line ranges (if total ≤ 50K chars)
3. **Index** — file paths and line ranges only (caller should use Read to view code)

## Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | (required) | DeepSeek API key |
| `FLASHLIGHT_MODEL` | `deepseek-v4-flash` | Model (`deepseek-v4-flash` or `deepseek-v4-pro`) |
| `FLASHLIGHT_REASONING_EFFORT` | `high` | Thinking effort (`high` or `max`) |
| `FLASHLIGHT_CHANGE_THRESHOLD` | `0.1` | Ratio of changed tokens to trigger base rebuild |
| `FLASHLIGHT_MAX_CONTEXT_TOKENS` | `900000` | Max tokens per shard (triggers auto-sharding when exceeded) |
| `FLASHLIGHT_KEEPER_URL` | (none) | URL of the keeper service for cache keepalive |

## How caching works

On first query, Flashlight sends all code to DeepSeek and saves a base snapshot. On subsequent queries:

1. **Probe** — check if DeepSeek's cache is still alive
2. **If alive** — detect file changes, send only changed files + new query
3. **If expired** — rebuild the base

After each rebuild, activation requests establish cache for future probes and queries.

## Sharding (large projects)

When a project exceeds `FLASHLIGHT_MAX_CONTEXT_TOKENS`, Flashlight automatically:

1. Splits files by directory — tries the whole project first, then recursively splits by top-level directories until each group fits
2. Queries all shards in parallel
3. Merges and deduplicates results

Each shard maintains independent cache state. Shard boundaries only change when a shard overflows (split eagerly, merge lazily).

## Cache Keepalive (Docker)

For long-lived cache preservation, deploy the keeper service:

```bash
docker run -d -p 3100:3100 ghcr.io/1percentsync/flashlight-keeper
```

Or with docker compose (`keeper/docker-compose.yml`):

```bash
cd keeper && docker compose up -d
```

Then set `FLASHLIGHT_KEEPER_URL=http://localhost:3100` in your MCP config.

The keeper periodically probes and re-activates cached contexts (default every 6h, max 48h lifetime). If a cache dies unexpectedly, the global interval tightens to 3h to protect remaining workspaces.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | HTTP server port |
| `DEFAULT_INTERVAL_MS` | `21600000` (6h) | Keepalive interval |
| `DEGRADED_INTERVAL_MS` | `10800000` (3h) | Interval after unexpected cache death |
| `MAX_LIFETIME_MS` | `172800000` (48h) | Max task lifetime |
| `ENABLE_REFRESH` | `false` | Enable /refresh endpoint (testing only) |

## Logs

Logs are written to `.flashlight/flashlight.log` in the workspace root. Each query logs:
- Snapshot size and shard plan
- Cache probe result (hit/miss)
- File change detection
- Per-shard query cache hit ratio
- Search results
- Activation status

## Cost

With `deepseek-v4-flash` on a ~50K token codebase:

| Operation | Cost |
|-----------|------|
| First query (build cache) | ~¥0.05 |
| Subsequent query (cache hit) | ~¥0.001 + output tokens |
| Activation (keepalive) | ~¥0.001 per shard |

## License

ISC
