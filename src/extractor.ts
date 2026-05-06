import type { Snapshot } from "./scanner.js";
import type { SearchResult } from "./deepseek.js";

const TOKEN_LIMIT = 25000;
const CHARS_PER_TOKEN = 2;
const CHAR_LIMIT = TOKEN_LIMIT * CHARS_PER_TOKEN;

export function extractResults(snapshot: Snapshot, results: SearchResult[]): string {
  if (results.length === 0) return "No matching code found.";

  const valid = results.filter((r) => snapshot.has(r.file));
  if (valid.length === 0) return "No matching files found in snapshot.";

  const merged = mergeOverlappingRanges(valid);

  const fullFiles = tryFullFiles(snapshot, merged);
  if (fullFiles) return fullFiles;

  const snippets = trySnippets(snapshot, merged);
  if (snippets) return snippets;

  return formatIndex(merged);
}

function mergeOverlappingRanges(results: SearchResult[]): SearchResult[] {
  const byFile = new Map<string, { start: number; end: number }[]>();

  for (const r of results) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file)!.push({ start: r.start_line, end: r.end_line });
  }

  const merged: SearchResult[] = [];

  for (const [file, ranges] of byFile) {
    ranges.sort((a, b) => a.start - b.start);

    let current = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const next = ranges[i];
      if (next.start <= current.end + 3) {
        current = { start: current.start, end: Math.max(current.end, next.end) };
      } else {
        merged.push({ file, start_line: current.start, end_line: current.end });
        current = next;
      }
    }
    merged.push({ file, start_line: current.start, end_line: current.end });
  }

  return merged;
}

function tryFullFiles(snapshot: Snapshot, results: SearchResult[]): string | null {
  const fileOrder: string[] = [];
  const fileLines = new Map<string, number[]>();

  for (const r of results) {
    if (!fileOrder.includes(r.file)) fileOrder.push(r.file);
    if (!fileLines.has(r.file)) fileLines.set(r.file, []);
    fileLines.get(r.file)!.push(r.start_line, r.end_line);
  }

  let totalChars = 0;
  for (const file of fileOrder) {
    const entry = snapshot.get(file)!;
    totalChars += entry.relativePath.length + entry.content.length + 50;
  }

  if (totalChars > CHAR_LIMIT) return null;

  const parts: string[] = [];
  for (const file of fileOrder) {
    const entry = snapshot.get(file)!;
    const lines = entry.content.split("\n");
    const numbered = lines.map((line, i) => `${i + 1}\t${line}`).join("\n");
    const relevant = fileLines.get(file)!;
    const ranges = formatRanges(relevant);
    parts.push(`--- ${entry.relativePath} (relevant lines: ${ranges}) ---\n${numbered}`);
  }

  return parts.join("\n\n");
}

function trySnippets(snapshot: Snapshot, results: SearchResult[]): string | null {
  let totalChars = 0;
  const parts: string[] = [];

  for (const r of results) {
    const entry = snapshot.get(r.file)!;
    const lines = entry.content.split("\n");
    const start = Math.max(0, r.start_line - 1);
    const end = Math.min(lines.length, r.end_line);
    const slice = lines.slice(start, end);
    const numbered = slice.map((line, i) => `${start + i + 1}\t${line}`).join("\n");
    const snippet = `--- ${entry.relativePath}:${r.start_line}-${r.end_line} ---\n${numbered}`;
    totalChars += snippet.length;
    parts.push(snippet);
  }

  if (totalChars > CHAR_LIMIT) return null;

  return parts.join("\n\n");
}

function formatIndex(results: SearchResult[]): string {
  const lines = results.map(
    (r) => `${r.file}:${r.start_line}-${r.end_line}`,
  );
  return "Results exceed size limit. File locations:\n\n" + lines.join("\n");
}

function formatRanges(lineNumbers: number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i < lineNumbers.length; i += 2) {
    pairs.push(`${lineNumbers[i]}-${lineNumbers[i + 1]}`);
  }
  return pairs.join(", ");
}
