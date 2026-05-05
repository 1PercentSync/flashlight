import { Tokenizer } from "@huggingface/tokenizers";
import path from "node:path";
import fs from "node:fs";

let tokenizer: InstanceType<typeof Tokenizer> | null = null;

export function initTokenizer(): void {
  const dir = path.join(import.meta.dirname!, "..", "deepseek_v3_tokenizer");
  const tokenizerJson = JSON.parse(fs.readFileSync(path.join(dir, "tokenizer.json"), "utf-8"));
  const configJson = JSON.parse(fs.readFileSync(path.join(dir, "tokenizer_config.json"), "utf-8"));
  tokenizer = new Tokenizer(tokenizerJson, configJson);
}

export function countTokens(text: string): number {
  if (!tokenizer) {
    throw new Error("Tokenizer not initialized. Call initTokenizer() first.");
  }
  return tokenizer.encode(text).ids.length;
}
