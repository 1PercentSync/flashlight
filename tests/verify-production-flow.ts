import OpenAI from "openai";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY environment variable");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: "https://api.deepseek.com",
});

async function send(label: string, messages: { role: string; content: string }[], thinking = false): Promise<{ hit: number; miss: number; total: number }> {
  const resp = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: messages as any,
    // @ts-expect-error DeepSeek-specific
    thinking: { type: thinking ? "enabled" : "disabled" },
  });

  // @ts-expect-error DeepSeek-specific
  const hit = resp.usage?.prompt_cache_hit_tokens ?? 0;
  // @ts-expect-error DeepSeek-specific
  const miss = resp.usage?.prompt_cache_miss_tokens ?? 0;
  const total = resp.usage?.prompt_tokens ?? 0;
  console.log(`  [${label}] total=${total}, hit=${hit}, miss=${miss}`);
  return { hit, miss, total };
}

function makeFirstTurn(key: string): string {
  return [
    `${key},前面的是缓存测试key,可以忽略。`,
    "",
    "你的任务是作为代码检索助手。用户会在后续消息中给你一个代码库的全部源代码文件，然后提出关于代码的问题。",
    "你需要仔细阅读所有提供的代码文件，理解它们的结构、依赖关系和功能实现，然后根据用户的查询找到最相关的代码片段，并调用 report_search_results 返回结果。",
    "",
    "注意事项：",
    "- 按相关性从高到低排序",
    "- 如果同一个文件有多个相关片段，分别列出",
    "- 行号从1开始计数",
    "- 包含函数或类的完整定义，不要截断",
    "- 如果查询涉及多个文件的交互，返回所有相关文件的片段",
    "- 优先返回定义而非引用",
    "- 对于import/export关系，同时返回两端的代码",
    "- 如果无法找到相关代码，返回空的results数组",
  ].join("\n");
}

const fakeBase = Array.from({ length: 30 }, (_, i) => [
  `--- File: src/module_${i}.ts (lines 1-10) ---`,
  `export class Module${i} {`,
  `  private value: number = ${i};`,
  `  getValue(): number { return this.value; }`,
  `  setValue(v: number): void { this.value = v; }`,
  `  toString(): string { return \`Module${i}(\${this.value})\`; }`,
  `}`,
].join("\n")).join("\n\n");

async function main() {
  const KEY_A = "PRODTEST_A_" + Date.now();
  const firstTurnA = makeFirstTurn(KEY_A);

  console.log("=== Test: Exact production flow simulation ===\n");
  console.log(`Key A: ${KEY_A}\n`);

  // Step 1: Simulate first query (rebuild)
  console.log("--- Step 1: First query (rebuild, like production) ---");
  const probe1 = await send("probe1", [
    { role: "user", content: firstTurnA },
    { role: "user", content: "当前是测试缓存是否依旧生效,直接回复OK" },
  ]);
  console.log(`  → probe miss (expected): ${probe1.hit === 0 ? "✓" : "✗"}\n`);

  console.log("  Sending query...");
  const query1 = await send("query1", [
    { role: "user", content: firstTurnA },
    { role: "user", content: fakeBase },
    { role: "user", content: "回复OK" },
  ]);
  console.log(`  → query hit=${query1.hit}\n`);

  // Step 2: Short activation (sequential, wait for completion)
  console.log("--- Step 2: Short activation (wait for completion) ---");
  const shortAct = await send("short-act", [
    { role: "user", content: firstTurnA },
    { role: "user", content: "OK" },
  ]);
  console.log(`  → short activation hit=${shortAct.hit}\n`);

  // Step 3: Base activation (sequential, wait for completion)
  console.log("--- Step 3: Base activation (wait for completion) ---");
  const baseAct = await send("base-act", [
    { role: "user", content: firstTurnA },
    { role: "user", content: fakeBase },
    { role: "user", content: "OK" },
  ]);
  console.log(`  → base activation hit=${baseAct.hit}\n`);

  // Step 4: Second probe (should hit now)
  console.log("--- Step 4: Second probe (should hit short activation's cache) ---");
  const probe2 = await send("probe2", [
    { role: "user", content: firstTurnA },
    { role: "user", content: "探测2,回复OK" },
  ]);
  console.log(`  → probe2 hit=${probe2.hit} (expect > 0: ${probe2.hit > 0 ? "✓" : "✗"})\n`);

  // Step 5: Second query (should hit base activation's cache)
  console.log("--- Step 5: Second query (should hit base activation's cache) ---");
  const query2 = await send("query2", [
    { role: "user", content: firstTurnA },
    { role: "user", content: fakeBase },
    { role: "user", content: "第二次查询,回复OK" },
  ]);
  console.log(`  → query2 hit=${query2.hit} (expect base cache hit: ${query2.hit > 1000 ? "✓" : "✗"})\n`);

  // Step 6: Now test with CONCURRENT activations (like production fire-and-forget)
  console.log("--- Step 6: Test concurrent activations ---");
  const KEY_B = "PRODTEST_B_" + Date.now();
  const firstTurnB = makeFirstTurn(KEY_B);
  console.log(`Key B: ${KEY_B}\n`);

  // Simulate rebuild query
  await send("queryB", [
    { role: "user", content: firstTurnB },
    { role: "user", content: fakeBase },
    { role: "user", content: "回复OK" },
  ]);

  // Fire all activations concurrently (like production)
  console.log("  Firing 3 activations concurrently...");
  const [sa, ba, ca] = await Promise.all([
    send("short-act-B", [
      { role: "user", content: firstTurnB },
      { role: "user", content: "OK" },
    ]),
    send("base-act-B", [
      { role: "user", content: firstTurnB },
      { role: "user", content: fakeBase },
      { role: "user", content: "OK" },
    ]),
    send("changes-act-B", [
      { role: "user", content: firstTurnB },
      { role: "user", content: fakeBase },
      { role: "user", content: "OK" },
    ]),
  ]);
  console.log("");

  // Probe after concurrent activations
  console.log("--- Step 7: Probe after concurrent activations ---");
  const probe3 = await send("probeB", [
    { role: "user", content: firstTurnB },
    { role: "user", content: "探测B,回复OK" },
  ]);
  console.log(`  → probeB hit=${probe3.hit} (expect > 0: ${probe3.hit > 0 ? "✓" : "✗"})\n`);

  // Query after concurrent activations
  console.log("--- Step 8: Query after concurrent activations ---");
  const queryB2 = await send("queryB2", [
    { role: "user", content: firstTurnB },
    { role: "user", content: fakeBase },
    { role: "user", content: "查询B2,回复OK" },
  ]);
  console.log(`  → queryB2 hit=${queryB2.hit} (expect base cache hit: ${queryB2.hit > 1000 ? "✓" : "✗"})\n`);
}

main().catch(console.error);
