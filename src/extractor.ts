import type { Snapshot } from "./scanner.js";
import type { SearchResult } from "./deepseek.js";
import { warn } from "./logger.js";

/** Format search results as code snippets (matched line ranges with line numbers). */
export function extractResults(snapshot: Snapshot, results: SearchResult[]): string {
  if (results.length === 0) return "No matching code found.";

  const valid = normalizeResults(snapshot, results);
  if (valid.length === 0) return "No matching files found in snapshot.";

  const merged = mergeOverlappingRanges(valid);
  return formatSnippets(snapshot, merged);
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

function formatSnippets(snapshot: Snapshot, results: SearchResult[]): string {
  const parts: string[] = [];

  for (const r of results) {
    const entry = snapshot.get(r.file)!;
    const lines = entry.content.split("\n");
    const start = Math.max(0, r.start_line - 1);
    const end = Math.min(lines.length, r.end_line);
    const slice = lines.slice(start, end);
    const numbered = slice.map((line, i) => `${start + i + 1}\t${line}`).join("\n");
    parts.push(`--- ${entry.relativePath}:${r.start_line}-${r.end_line} ---\n${numbered}`);
  }

  return parts.join("\n\n");
}

function normalizeResults(snapshot: Snapshot, results: SearchResult[]): SearchResult[] {
  const normalized: SearchResult[] = [];
  for (const r of results) {
    const entry = snapshot.get(r.file);
    if (!entry) {
      warn(`result filtered: file "${r.file}" not in snapshot`);
      continue;
    }
    if (typeof r.start_line !== "number" || typeof r.end_line !== "number") {
      warn(`result filtered: invalid line numbers for "${r.file}"`);
      continue;
    }

    const totalLines = entry.content.split("\n").length;
    let start = Math.max(1, Math.round(r.start_line));
    let end = Math.max(1, Math.round(r.end_line));
    if (start > end) [start, end] = [end, start];
    end = Math.min(end, totalLines);

    if (start > totalLines) {
      warn(`result filtered: "${r.file}":${r.start_line}-${r.end_line} beyond file length (${totalLines} lines)`);
      continue;
    }

    normalized.push({ file: r.file, start_line: start, end_line: end });
  }
  return normalized;
}


