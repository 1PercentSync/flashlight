import OpenAI from "openai";
import { execSync } from "node:child_process";
import { join } from "node:path";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY environment variable");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: "https://api.deepseek.com",
});

const TOKENIZER_DIR = join(import.meta.dirname!, "..", "deepseek_v3_tokenizer");

function countTokens(text: string): number {
  const script = `
import transformers, sys, json
tokenizer = transformers.AutoTokenizer.from_pretrained("${TOKENIZER_DIR.replace(/\\/g, "/")}", trust_remote_code=True)
text = json.loads(sys.stdin.read())
print(len(tokenizer.encode(text)))
`.trim();

  const result = execSync(`uv run --with transformers python3 -c '${script}'`, {
    input: JSON.stringify(text),
    encoding: "utf-8",
    timeout: 30000,
  });
  return parseInt(result.trim(), 10);
}

// --- Test 1: Basic connectivity ---

async function test1_basic() {
  console.log("=== Test 1: Basic connectivity (JSON Output + Streaming + Thinking) ===\n");

  const stream = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: 'You output json. Example: {"answer": "hello"}' },
      { role: "user", content: 'What is 2+2? Reply with json key "answer".' },
    ],
    stream: true,
    stream_options: { include_usage: true },
    response_format: { type: "json_object" },
    reasoning_effort: "high",
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "enabled" },
  });

  let reasoning = "";
  let content = "";
  let usage: any = null;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    // @ts-expect-error DeepSeek-specific
    if (delta?.reasoning_content) reasoning += delta.reasoning_content;
    if (delta?.content) content += delta.content;
    if (chunk.usage) usage = chunk.usage;
  }

  console.log("reasoning_content length:", reasoning.length);
  console.log("content:", content);
  console.log("usage:", JSON.stringify(usage, null, 2));
  const parsed = JSON.parse(content);
  console.log("parsed JSON:", parsed);
  console.log("\n✓ Test 1 PASSED\n");
}

// --- Test 2: Consecutive user messages ---

async function test2_consecutive_user() {
  console.log("=== Test 2: Consecutive user messages (no assistant in between) ===\n");

  try {
    const response = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      messages: [
        { role: "user", content: "This is message 1. Remember the number 42." },
        { role: "user", content: "This is message 2. Remember the number 73." },
        { role: "user", content: "This is message 3. What two numbers did I mention? Reply briefly." },
      ],
      // @ts-expect-error DeepSeek-specific
      thinking: { type: "disabled" },
    });

    console.log("Response:", response.choices[0].message.content);
    console.log("\n✓ Test 2 PASSED — consecutive user messages accepted\n");
  } catch (err: any) {
    console.log("✗ Test 2 FAILED:", err.message);
    process.exit(1);
  }
}

// --- Test 3: Cache probe with threshold algorithm ---

async function test3_cache_probe() {
  console.log("=== Test 3: Cache probe — simulating production flow ===\n");

  // Simulate user[1]: cache_test_key + system instructions
  // Must be long enough to be independently cached as a prefix unit
  const cacheKey = "CACHE_TEST_KEY_" + Date.now();
  const systemInstructions = [
    `${cacheKey},前面的是缓存测试key,可以忽略。`,
    "",
    "你的任务是作为代码检索助手。用户会在后续消息中给你一个代码库的全部源代码文件，然后提出关于代码的问题。",
    "",
    "你需要仔细阅读所有提供的代码文件，理解它们的结构、依赖关系和功能实现，然后根据用户的查询找到最相关的代码片段。",
    "",
    "返回格式要求：",
    "- 必须使用JSON格式",
    "- 返回一个results数组，每项包含file（文件路径）、start_line（起始行号）、end_line（结束行号）",
    "- 按相关性从高到低排序",
    "- 如果同一个文件有多个相关片段，分别列出",
    "",
    "注意事项：",
    "- 行号从1开始计数",
    "- 包含函数或类的完整定义，不要截断",
    "- 如果查询涉及多个文件的交互，返回所有相关文件的片段",
    "- 优先返回定义而非引用",
    "- 对于import/export关系，同时返回两端的代码",
    "- 不要返回注释、空行等无意义内容",
    "- 如果无法找到相关代码，返回空的results数组",
  ].join("\n");

  // Simulate user[2]: Base context (fake code)
  const fakeBase = Array.from({ length: 20 }, (_, i) => [
    `--- File: src/module_${i}.ts (lines 1-10) ---`,
    `export class Module${i} {`,
    `  private value: number = ${i};`,
    `  getValue(): number { return this.value; }`,
    `  setValue(v: number): void { this.value = v; }`,
    `  toString(): string { return \`Module${i}(\${this.value})\`; }`,
    `}`,
    "",
  ].join("\n")).join("\n");

  // Simulate user[3]: Change context
  const fakeChanges = [
    "--- File: src/module_0.ts (UPDATED, lines 1-12) ---",
    "export class Module0 {",
    "  private value: number = 0;",
    "  private label: string = 'default';",
    "  getValue(): number { return this.value; }",
    "  setValue(v: number): void { this.value = v; }",
    "  getLabel(): string { return this.label; }",
    "  toString(): string { return `Module0(${this.value}, ${this.label})`; }",
    "}",
  ].join("\n");

  // Simulate user[4]: Directory tree + query
  const fakeQuery = [
    "目录树:",
    ...Array.from({ length: 20 }, (_, i) =>
      `  src/module_${i}.ts ${i === 0 ? "[变更区]" : "[Base]"}`
    ),
    "",
    '查询: 找到getValue方法的所有实现, 返回json: {"results": [{"file": "...", "start_line": 1, "end_line": 5}]}',
  ].join("\n");

  // Count first turn tokens using tokenizer
  const firstTurnTokens = countTokens(systemInstructions);
  console.log(`first_turn_token_count (via tokenizer): ${firstTurnTokens}`);
  console.log(`threshold (half): ${firstTurnTokens / 2}`);

  // Step 1: Send full request to build cache
  console.log("\nStep 1: Sending full 4-message request to build cache...");
  const resp1 = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: systemInstructions },
      { role: "user", content: fakeBase },
      { role: "user", content: fakeChanges },
      { role: "user", content: fakeQuery },
    ],
    response_format: { type: "json_object" },
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "disabled" },
  });

  // @ts-expect-error DeepSeek-specific
  const hit1 = resp1.usage?.prompt_cache_hit_tokens ?? 0;
  // @ts-expect-error DeepSeek-specific
  const miss1 = resp1.usage?.prompt_cache_miss_tokens ?? 0;
  console.log(`  cache_hit=${hit1}, cache_miss=${miss1}, total_prompt=${resp1.usage?.prompt_tokens}`);

  // Step 2: Probe — same first turn + short probe message
  console.log("\nStep 2: Sending cache probe (first turn + probe message)...");
  const resp2 = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: systemInstructions },
      { role: "user", content: "当前是测试缓存是否依旧生效,直接回复OK" },
    ],
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "disabled" },
  });

  // @ts-expect-error DeepSeek-specific
  const hit2 = resp2.usage?.prompt_cache_hit_tokens ?? 0;
  // @ts-expect-error DeepSeek-specific
  const miss2 = resp2.usage?.prompt_cache_miss_tokens ?? 0;
  console.log(`  cache_hit=${hit2}, cache_miss=${miss2}, total_prompt=${resp2.usage?.prompt_tokens}`);

  // Step 3: Third probe (after common prefix detection)
  console.log("\nStep 3: Third probe (common prefix should be detected now)...");
  const resp3 = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: systemInstructions },
      { role: "user", content: "第三次探测,回复OK" },
    ],
    // @ts-expect-error DeepSeek-specific
    thinking: { type: "disabled" },
  });

  // @ts-expect-error DeepSeek-specific
  const hit3 = resp3.usage?.prompt_cache_hit_tokens ?? 0;
  // @ts-expect-error DeepSeek-specific
  const miss3 = resp3.usage?.prompt_cache_miss_tokens ?? 0;
  console.log(`  cache_hit=${hit3}, cache_miss=${miss3}, total_prompt=${resp3.usage?.prompt_tokens}`);

  // Apply threshold algorithm on best result
  const bestHit = Math.max(hit2, hit3);
  const threshold = firstTurnTokens / 2;
  const cacheAlive = bestHit > threshold;

  console.log("\n--- Threshold Algorithm Result ---");
  console.log(`  first_turn_token_count = ${firstTurnTokens}`);
  console.log(`  threshold = first_turn_token_count / 2 = ${threshold}`);
  console.log(`  best prompt_cache_hit_tokens = ${bestHit}`);
  console.log(`  judgment: ${bestHit} > ${threshold} => cache_alive = ${cacheAlive}`);

  if (cacheAlive) {
    console.log("\n✓ Test 3 PASSED — threshold algorithm works\n");
  } else {
    console.log("\n✗ Test 3 FAILED — cache not detected with this input size\n");
  }
}

// --- Main ---

async function main() {
  try {
    await test1_basic();
    await test2_consecutive_user();
    await test3_cache_probe();
    console.log("=== All tests completed ===");
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
