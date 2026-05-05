# ignore

Version: ^7.0.5

Pure JavaScript implementation of `.gitignore` spec. Used to filter workspace files.

---

## Basic Usage

```typescript
import ignore from "ignore";
import { readFileSync } from "node:fs";

// Create instance and load .gitignore rules
const ig = ignore().add(readFileSync(".gitignore", "utf-8"));

// Add extra rules programmatically
ig.add(["node_modules", "dist"]);
```

---

## Filter File Paths

```typescript
const allFiles = ["src/index.ts", "node_modules/foo/index.js", "dist/index.js", "README.md"];

const kept = ig.filter(allFiles);
// => ["src/index.ts", "README.md"]
```

---

## Check Single Path

```typescript
ig.ignores("node_modules/foo/index.js"); // true
ig.ignores("src/index.ts");              // false
```

---

## Important Rules

1. Paths must be **relative** (no leading `./`, `/`, or absolute paths)
2. Use forward slashes, even on Windows
3. Paths should be relative to the `.gitignore` location (project root)

```typescript
// Correct
ig.ignores("src/utils.ts");

// WRONG - will not work
ig.ignores("./src/utils.ts");
ig.ignores("/src/utils.ts");
ig.ignores("C:\\project\\src\\utils.ts");
```

---

## Nested .gitignore Support

For projects with nested `.gitignore` files, create separate instances per directory and apply them with correct relative paths.
