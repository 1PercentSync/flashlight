import OpenAI from "openai";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY environment variable");
  process.exit(1);
}

const TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "report_search_results",
    strict: true,
    description: "Report code search results",
    parameters: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              start_line: { type: "integer" },
              end_line: { type: "integer" },
            },
            required: ["file", "start_line", "end_line"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
      additionalProperties: false,
    },
  },
};

const messages: OpenAI.ChatCompletionMessageParam[] = [
  {
    role: "user",
    content: `Here is a code file:

--- src/math.ts (lines 1-5) ---
1\texport function add(a: number, b: number): number { return a + b; }
2\texport function sub(a: number, b: number): number { return a - b; }
3\texport function mul(a: number, b: number): number { return a * b; }
4\texport function div(a: number, b: number): number { return a / b; }
5\texport function mod(a: number, b: number): number { return a % b; }

Find the addition function.`,
  },
];

const toolChoices = [
  { label: "auto", value: "auto" as const },
  { label: "required", value: "required" as const },
  { label: "named", value: { type: "function" as const, function: { name: "report_search_results" } } },
];

async function testCombination(
  label: string,
  opts: {
    thinking: boolean;
    beta: boolean;
    toolChoice: string | object;
    stream: boolean;
  },
) {
  const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: opts.beta ? "https://api.deepseek.com/beta" : "https://api.deepseek.com",
  });

  try {
    if (opts.stream) {
      const stream = await client.chat.completions.create({
        model: "deepseek-v4-flash",
        messages,
        tools: [TOOL],
        tool_choice: opts.toolChoice as any,
        stream: true,
        stream_options: { include_usage: true },
        // @ts-expect-error DeepSeek-specific
        thinking: { type: opts.thinking ? "enabled" : "disabled" },
      });

      let toolArgs = "";
      let content = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.tool_calls?.[0]?.function?.arguments) {
          toolArgs += delta.tool_calls[0].function.arguments;
        }
        if (delta?.content) content += delta.content;
      }

      if (toolArgs) {
        const parsed = JSON.parse(toolArgs);
        console.log(`  [${label}] ✓ tool_call: ${JSON.stringify(parsed)}`);
      } else if (content) {
        console.log(`  [${label}] ✓ content (no tool call): ${content.slice(0, 100)}`);
      } else {
        console.log(`  [${label}] ✓ empty response`);
      }
    } else {
      const resp = await client.chat.completions.create({
        model: "deepseek-v4-flash",
        messages,
        tools: [TOOL],
        tool_choice: opts.toolChoice as any,
        // @ts-expect-error DeepSeek-specific
        thinking: { type: opts.thinking ? "enabled" : "disabled" },
      });

      const msg = resp.choices[0].message;
      if (msg.tool_calls?.length) {
        const args = JSON.parse(msg.tool_calls[0].function.arguments);
        console.log(`  [${label}] ✓ tool_call: ${JSON.stringify(args)}`);
      } else if (msg.content) {
        console.log(`  [${label}] ✓ content (no tool call): ${msg.content.slice(0, 100)}`);
      }
    }
  } catch (err: any) {
    console.log(`  [${label}] ✗ ${err.message}`);
  }
}

async function main() {
  console.log("=== DeepSeek Tool Call Compatibility Test ===\n");

  for (const tc of toolChoices) {
    for (const thinking of [false, true]) {
      for (const beta of [false, true]) {
        for (const stream of [false, true]) {
          const label = [
            `choice=${tc.label}`,
            thinking ? "thinking" : "no-think",
            beta ? "beta" : "stable",
            stream ? "stream" : "non-stream",
          ].join(", ");
          await testCombination(label, { thinking, beta, toolChoice: tc.value, stream });
        }
      }
    }
  }
}

main().catch(console.error);
