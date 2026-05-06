import OpenAI from "openai";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY");
  process.exit(1);
}

const client = new OpenAI({ apiKey: API_KEY, baseURL: "https://api.deepseek.com" });

async function send(label: string, messages: any[]): Promise<void> {
  const resp = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages,
    // @ts-expect-error
    thinking: { type: "disabled" },
  });
  const u = resp.usage!;
  // @ts-expect-error
  console.log(`  [${label}] total=${u.prompt_tokens} hit=${u.prompt_cache_hit_tokens ?? 0} miss=${u.prompt_cache_miss_tokens ?? 0}`);
}

async function main() {
  const uid = Date.now();

  // Use the EXACT same firstTurn format as production
  const firstTurn = [
    `${uid.toString(16)},前面的是缓存测试key,可以忽略。`,
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

  console.log(`firstTurn length: ${firstTurn.length} chars\n`);

  // Test A: Short activation then probe (exact production sequence)
  console.log("=== Test A: short-activation → probe ===");
  await send("short-act", [{ role: "user", content: firstTurn }, { role: "user", content: "OK" }]);
  await send("probe", [{ role: "user", content: firstTurn }, { role: "user", content: "当前是测试缓存是否依旧生效,直接回复OK" }]);

  // Test B: Does the probe message matter?
  console.log("\n=== Test B: same prefix, different second message ===");
  await send("msg-a", [{ role: "user", content: firstTurn }, { role: "user", content: "aaa" }]);
  await send("msg-b", [{ role: "user", content: firstTurn }, { role: "user", content: "bbb" }]);

  // Test C: Does thinking mode on the query affect cache?
  console.log("\n=== Test C: query with thinking+tools, then probe ===");
  const uid2 = Date.now();
  const firstTurn2 = firstTurn.replace(uid.toString(16), uid2.toString(16));
  const fakeBase = Array.from({ length: 20 }, (_, i) =>
    `--- src/m${i}.ts ---\nexport const x${i} = ${i};\n`
  ).join("\n");

  // Query with thinking+tools (like production)
  const stream = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: firstTurn2 },
      { role: "user", content: fakeBase },
      { role: "user", content: "回复OK" },
    ],
    tools: [{
      type: "function",
      function: {
        name: "report_search_results",
        strict: true,
        description: "Report results",
        parameters: {
          type: "object",
          properties: { results: { type: "array", items: { type: "object", properties: { file: { type: "string" }, start_line: { type: "integer" }, end_line: { type: "integer" } }, required: ["file", "start_line", "end_line"], additionalProperties: false } } },
          required: ["results"],
          additionalProperties: false,
        },
      },
    }],
    stream: true,
    stream_options: { include_usage: true },
    // @ts-expect-error
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  });
  let usage: any = null;
  for await (const chunk of stream) { if (chunk.usage) usage = chunk.usage; }
  // @ts-expect-error
  console.log(`  [query-think] total=${usage.prompt_tokens} hit=${usage.prompt_cache_hit_tokens ?? 0} miss=${usage.prompt_cache_miss_tokens ?? 0}`);

  // Short activation (no thinking)
  await send("short-act2", [{ role: "user", content: firstTurn2 }, { role: "user", content: "OK" }]);
  // Probe (no thinking)
  await send("probe2", [{ role: "user", content: firstTurn2 }, { role: "user", content: "探测,回复OK" }]);

  // Test D: Does thinking vs no-thinking share cache?
  console.log("\n=== Test D: thinking mode cache isolation ===");
  const uid3 = Date.now();
  const firstTurn3 = firstTurn.replace(uid.toString(16), uid3.toString(16));

  // Send with thinking=disabled
  await send("no-think-1", [{ role: "user", content: firstTurn3 }, { role: "user", content: "msg1" }]);
  await send("no-think-2", [{ role: "user", content: firstTurn3 }, { role: "user", content: "msg2" }]);
  console.log("  (expect hit on no-think-2)");

  // Now send with thinking=enabled
  const stream2 = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: firstTurn3 }, { role: "user", content: "msg3" }],
    // @ts-expect-error
    thinking: { type: "enabled" },
  });
  // @ts-expect-error
  console.log(`  [think-1] total=${stream2.usage?.prompt_tokens} hit=${stream2.usage?.prompt_cache_hit_tokens ?? 0} miss=${stream2.usage?.prompt_cache_miss_tokens ?? 0}`);
  console.log("  (does thinking mode share cache with non-thinking?)");
}

main().catch(console.error);
