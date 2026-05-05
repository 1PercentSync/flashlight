# @modelcontextprotocol/server

Version: ^2.0.0-alpha.2

MCP TypeScript SDK, used to create an MCP Server that exposes tools via stdio transport.

---

## Basic Server Setup

```typescript
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const server = new McpServer({ name: "flashlight", version: "0.1.0" });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
```

---

## Registering a Tool

```typescript
import type { CallToolResult } from "@modelcontextprotocol/server";

server.registerTool(
  "search",
  {
    description: "Search code in the workspace",
    inputSchema: z.object({
      query: z.string().describe("Natural language query"),
      scope: z.string().optional().describe("Directory scope"),
      file_types: z.array(z.string()).optional().describe("File type filter"),
    }),
  },
  async ({ query, scope, file_types }): Promise<CallToolResult> => {
    // ... implementation
    return {
      content: [{ type: "text", text: "result here" }],
    };
  }
);
```

---

## Error Handling in Tools

```typescript
server.registerTool(
  "search",
  { /* ... */ },
  async (args): Promise<CallToolResult> => {
    try {
      // ...
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);
```

---

## Key Points

- Uses `zod/v4` (not v3) for input schema validation
- `inputSchema` must be wrapped with `z.object()`
- Tool callback receives destructured validated args directly
- Return `{ content: [{ type: "text", text }] }` for results
- Set `isError: true` to indicate failure
