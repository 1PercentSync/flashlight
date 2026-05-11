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

const DEFAULT_EXT_WHITELIST = [
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
];

/** Load and validate configuration from environment variables. */
export function loadConfig(): FlashlightConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY environment variable is required");
  }

  let model: FlashlightConfig["model"] = "deepseek-v4-flash";
  if (process.env.FLASHLIGHT_MODEL === "deepseek-v4-pro") {
    model = "deepseek-v4-pro";
  }

  let reasoningEffort: FlashlightConfig["reasoning_effort"] = "high";
  if (process.env.FLASHLIGHT_REASONING_EFFORT === "max") {
    reasoningEffort = "max";
  }

  let extWhitelist = DEFAULT_EXT_WHITELIST;
  if (process.env.FLASHLIGHT_EXT_WHITELIST) {
    extWhitelist = process.env.FLASHLIGHT_EXT_WHITELIST.split(",").map((s) => s.trim()).filter(Boolean);
  }

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
