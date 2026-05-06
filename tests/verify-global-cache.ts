import OpenAI from "openai";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error("Missing DEEPSEEK_API_KEY"); process.exit(1); }

const client = new OpenAI({ apiKey: API_KEY, baseURL: "https://api.deepseek.com" });

async function send(label: string, messages: any[], thinking = false): Promise<void> {
  const resp = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    messages,
    // @ts-expect-error
    thinking: { type: thinking ? "enabled" : "disabled" },
  });
  const u = resp.usage!;
  // @ts-expect-error
  console.log(`  [${label}] total=${u.prompt_tokens} hit=${u.prompt_cache_hit_tokens ?? 0} miss=${u.prompt_cache_miss_tokens ?? 0}`);
}

async function main() {
  // Test 1: Completely random content, first ever request - does it hit 128?
  console.log("=== Test 1: Random content, single request (thinking=off) ===");
  const random1 = "RANDOM_" + Math.random().toString(36).slice(2) + "_" + Date.now() + " " + "x".repeat(200);
  await send("random-off", [{ role: "user", content: random1 }], false);

  console.log("\n=== Test 2: Random content, single request (thinking=on) ===");
  const random2 = "RANDOM_" + Math.random().toString(36).slice(2) + "_" + Date.now() + " " + "x".repeat(200);
  await send("random-on", [{ role: "user", content: random2 }], true);

  console.log("\n=== Test 3: Very short random (thinking=off) ===");
  const random3 = "SHORT_" + Math.random().toString(36).slice(2) + "_" + Date.now();
  await send("short-off", [{ role: "user", content: random3 }], false);

  console.log("\n=== Test 4: Very short random (thinking=on) ===");
  const random4 = "SHORT_" + Math.random().toString(36).slice(2) + "_" + Date.now();
  await send("short-on", [{ role: "user", content: random4 }], true);

  console.log("\n=== Test 5: Non-thinking write isolation ===");
  const uid5 = "ISO_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const content5 = uid5 + " " + "用于测试非thinking模式缓存写入。".repeat(15);
  await send("off-1", [{ role: "user", content: content5 }, { role: "user", content: "a" }], false);
  await send("off-2", [{ role: "user", content: content5 }, { role: "user", content: "b" }], false);
  await send("off-3", [{ role: "user", content: content5 }, { role: "user", content: "c" }], false);
  await send("on-1",  [{ role: "user", content: content5 }, { role: "user", content: "d" }], true);
}

main().catch(console.error);
