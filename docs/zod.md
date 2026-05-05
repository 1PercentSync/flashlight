# zod

Version: ^4.4.3

Schema validation library. Required by MCP SDK for tool input schema definition.

---

## Import (v4)

```typescript
import * as z from "zod/v4";
```

> MCP SDK v2 requires `zod/v4` specifically, not the default `zod` import.

---

## Defining Tool Input Schema

```typescript
const inputSchema = z.object({
  query: z.string().describe("Natural language query"),
  scope: z.string().optional().describe("Relative directory path"),
  file_types: z.array(z.string()).optional().describe("File type filter"),
});
```

---

## Common Types

```typescript
z.string()              // string
z.number()              // number
z.boolean()             // boolean
z.array(z.string())     // string[]
z.string().optional()   // string | undefined
z.enum(["a", "b"])      // "a" | "b"
```

---

## Key Points

- Import from `"zod/v4"` not `"zod"` when used with MCP SDK
- Use `.describe()` to add parameter descriptions (shown to the Agent)
- Use `.optional()` for non-required parameters
- Always wrap in `z.object()` for MCP tool schemas
