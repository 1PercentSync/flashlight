import fs from "node:fs";
import path from "node:path";

/** Flashlight runtime configuration. */
export interface FlashlightConfig {
  /** DeepSeek API key for authentication. */
  deepseek_api_key: string;
  /** DeepSeek model to use. */
  model: "deepseek-v4-flash" | "deepseek-v4-pro";
  /** Thinking effort level for the model. */
  reasoning_effort: "high" | "max";
  /** Allowed file extensions for scanning (e.g. [".ts", ".py"]). */
  ext_whitelist: string[];
  /** Ratio of changed tokens to base tokens that triggers a full rebuild. */
  change_threshold: number;
  /** Max tokens per shard before auto-sharding kicks in. */
  max_context_tokens: number;
}

export const DEFAULT_EXT_WHITELIST = [
  // Python
  ".py", ".pyi", ".pyx",
  // C / C++
  ".c", ".h", ".cpp", ".cxx", ".cc", ".hpp", ".hxx",
  // Java
  ".java",
  // C#
  ".cs",
  // JavaScript / TypeScript
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
  // Visual Basic
  ".vb", ".vbs",
  // SQL
  ".sql",
  // R
  ".r", ".R",
  // Delphi / Object Pascal
  ".pas", ".dpr",
  // Perl
  ".pl", ".pm",
  // Fortran
  ".f", ".f90", ".f95", ".f03",
  // PHP
  ".php",
  // Go
  ".go",
  // Rust
  ".rs",
  // MATLAB / Octave
  ".m",
  // C / C++ inline implementations
  ".inl",
  // Assembly
  ".asm", ".s", ".S",
  // Swift
  ".swift",
  // Ada
  ".adb", ".ads",
  // Kotlin
  ".kt", ".kts",
  // Scala
  ".scala",
  // Ruby
  ".rb",
  // Lua
  ".lua",
  // Shell
  ".sh", ".bash", ".zsh",
  // Dart
  ".dart",
  // Elixir / Erlang
  ".ex", ".exs", ".erl",
  // Haskell
  ".hs",
  // Zig
  ".zig",
  // Nim
  ".nim",
  // OCaml
  ".ml", ".mli",
  // Clojure
  ".clj", ".cljs", ".cljc",
  // Shader languages (GLSL / HLSL / WGSL / Metal / SPIR-V)
  ".glsl", ".vert", ".frag", ".comp", ".geom", ".tesc", ".tese",
  ".rgen", ".rchit", ".rahit", ".rmiss", ".rint", ".rcall",
  ".mesh", ".task",
  ".hlsl", ".hlsli", ".fx",
  ".wgsl",
  ".metal",
  // Vue / Svelte
  ".vue", ".svelte",
  // Markup / Style (hand-written)
  ".html", ".htm", ".css", ".scss", ".less",
  // Config (hand-written, typically small)
  ".yaml", ".yml", ".toml",
  // IPC / IPS
  ".ipsc",
];

/** Project-level extension whitelist configuration from `.flashlight/config.json`. */
export interface ProjectExtConfig {
  ext_whitelist?: string[];
  ext_whitelist_override?: boolean;
}

/** Read project-level extension config. Returns null if file is missing or invalid. */
export function readProjectExtConfig(workspaceRoot: string): ProjectExtConfig | null {
  const configPath = path.join(workspaceRoot, ".flashlight", "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const result: ProjectExtConfig = {};

    if (Array.isArray(raw.ext_whitelist)) {
      const valid = raw.ext_whitelist.filter(
        (e: unknown) => typeof e === "string" && e.startsWith("."),
      );
      if (valid.length > 0) result.ext_whitelist = valid;
    }

    if (typeof raw.ext_whitelist_override === "boolean") {
      result.ext_whitelist_override = raw.ext_whitelist_override;
    }

    return result;
  } catch {
    return null;
  }
}

/** Resolve the effective extension whitelist. Priority: project config > env var > default. */
export function resolveExtWhitelist(workspaceRoot?: string): string[] {
  let globalWhitelist = DEFAULT_EXT_WHITELIST;
  if (process.env.FLASHLIGHT_EXT_WHITELIST) {
    globalWhitelist = process.env.FLASHLIGHT_EXT_WHITELIST.split(",").map((s) => s.trim()).filter(Boolean);
  }

  if (workspaceRoot) {
    const project = readProjectExtConfig(workspaceRoot);
    if (project?.ext_whitelist) {
      if (project.ext_whitelist_override) {
        return project.ext_whitelist;
      }
      return [...new Set([...globalWhitelist, ...project.ext_whitelist])];
    }
  }

  return globalWhitelist;
}

/** Load and validate configuration from environment variables and project config. */
export function loadConfig(workspaceRoot?: string): FlashlightConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY environment variable is required");
  }

  let model: FlashlightConfig["model"] = "deepseek-v4-flash";
  if (process.env.FLASHLIGHT_MODEL === "deepseek-v4-pro") {
    model = "deepseek-v4-pro";
  }

  let reasoningEffort: FlashlightConfig["reasoning_effort"] = "max";
  if (process.env.FLASHLIGHT_REASONING_EFFORT === "high") {
    reasoningEffort = "high";
  }

  const extWhitelist = resolveExtWhitelist(workspaceRoot);

  let changeThreshold = 0.1;
  const ctEnv = parseFloat(process.env.FLASHLIGHT_CHANGE_THRESHOLD ?? "");
  if (ctEnv > 0 && ctEnv < 1) {
    changeThreshold = ctEnv;
  }

  let maxContextTokens = 900_000;
  const mctEnv = parseInt(process.env.FLASHLIGHT_MAX_CONTEXT_TOKENS ?? "", 10);
  if (mctEnv >= 100_000 && mctEnv <= 1_000_000) {
    maxContextTokens = mctEnv;
  }

  return {
    deepseek_api_key: apiKey,
    ext_whitelist: extWhitelist,
    model,
    reasoning_effort: reasoningEffort,
    change_threshold: changeThreshold,
    max_context_tokens: maxContextTokens,
  };
}
