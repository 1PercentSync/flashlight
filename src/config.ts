export interface FlashlightConfig {
  deepseek_api_key: string;
  ext_whitelist: string[];
  model: "deepseek-v4-flash" | "deepseek-v4-pro";
  reasoning_effort: "high" | "max";
  change_threshold: number;
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
  // Vue / Svelte
  ".vue", ".svelte",
  // Markup / Style (hand-written)
  ".html", ".htm", ".css", ".scss", ".less",
  // Documentation
  ".md", ".txt",
  // Config (hand-written, typically small)
  ".yaml", ".yml", ".toml",
];

export function loadConfig(args: Record<string, unknown>): FlashlightConfig {
  const apiKey = args.deepseek_api_key;
  if (typeof apiKey !== "string" || !apiKey) {
    throw new Error("deepseek_api_key is required");
  }

  let extWhitelist = DEFAULT_EXT_WHITELIST;
  if (Array.isArray(args.ext_whitelist)) {
    extWhitelist = args.ext_whitelist.filter((x): x is string => typeof x === "string");
  }

  let model: FlashlightConfig["model"] = "deepseek-v4-flash";
  if (args.model === "deepseek-v4-pro") {
    model = "deepseek-v4-pro";
  }

  let reasoningEffort: FlashlightConfig["reasoning_effort"] = "high";
  if (args.reasoning_effort === "max") {
    reasoningEffort = "max";
  }

  let changeThreshold = 0.1;
  if (typeof args.change_threshold === "number" && args.change_threshold > 0 && args.change_threshold < 1) {
    changeThreshold = args.change_threshold;
  }

  return {
    deepseek_api_key: apiKey,
    ext_whitelist: extWhitelist,
    model,
    reasoning_effort: reasoningEffort,
    change_threshold: changeThreshold,
  };
}
