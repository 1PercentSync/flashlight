import crypto from "node:crypto";
import type { Snapshot, FileEntry } from "./scanner.js";
import { sortByGitTime } from "./scanner.js";
import type { ChangeDetectionResult } from "./base.js";

const SYSTEM_INSTRUCTIONS = `你的任务是作为代码检索助手。用户会在后续消息中给你一个代码库的全部源代码文件，然后提出关于代码的问题。

你需要仔细阅读所有提供的代码文件，理解它们的结构、依赖关系和功能实现，然后根据用户的查询找到最相关的代码片段，并调用 report_search_results 返回结果。

重要：你必须始终通过调用 report_search_results 工具来返回结果。绝对不要用普通文本回复。如果找不到相关代码，调用 report_search_results 并传入空的 results 数组。

注意事项：
- 按相关性从高到低排序
- 如果同一个文件有多个相关片段，分别列出
- 行号从1开始计数
- 包含函数或类的完整定义，不要截断
- 如果查询涉及多个文件的交互，返回所有相关文件的片段
- 优先返回定义而非引用
- 对于import/export关系，同时返回两端的代码
- 如果无法找到相关代码，调用 report_search_results({ "results": [] })`;

const SHARDED_SYSTEM_INSTRUCTIONS = `你的任务是作为代码检索助手。用户会在后续消息中给你一个代码库的部分源代码文件（按目录分片），然后提出关于代码的问题。

你正在查看的是项目的一个子集。完整项目目录树会在查询中提供，你只负责在你收到的文件中查找相关代码。

你需要仔细阅读所有提供的代码文件，理解它们的结构、依赖关系和功能实现，然后根据用户的查询找到最相关的代码片段，并调用 report_search_results 返回结果。

重要：你必须始终通过调用 report_search_results 工具来返回结果。绝对不要用普通文本回复。如果你的分片中没有相关代码，调用 report_search_results 并传入空的 results 数组。

注意事项：
- 按相关性从高到低排序
- 如果同一个文件有多个相关片段，分别列出
- 行号从1开始计数
- 包含函数或类的完整定义，不要截断
- 如果查询涉及多个文件的交互，返回所有相关文件的片段
- 优先返回定义而非引用
- 对于import/export关系，同时返回两端的代码（如果在你的分片中）
- 如果无法找到相关代码，调用 report_search_results({ "results": [] })`;

export function generateCacheKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildFirstTurn(cacheKey: string): string {
  return `${cacheKey},前面的是缓存测试key,可以忽略。\n\n${SYSTEM_INSTRUCTIONS}`;
}

export function buildFirstTurnSharded(cacheKey: string): string {
  return `${cacheKey},前面的是缓存测试key,可以忽略。\n\n${SHARDED_SYSTEM_INSTRUCTIONS}`;
}

export function buildBaseContext(
  workspaceRoot: string,
  snapshot: Snapshot,
  excludeFiles?: Set<string>,
): string {
  let files = [...snapshot.keys()];
  if (excludeFiles) {
    files = files.filter((f) => !excludeFiles.has(f));
  }
  files = sortByGitTime(workspaceRoot, files);
  return files.map((f) => formatFile(snapshot.get(f)!)).join("\n\n");
}

export function buildShardBaseContext(
  workspaceRoot: string,
  snapshot: Snapshot,
  shardFiles: string[],
): string {
  const sorted = sortByGitTime(workspaceRoot, shardFiles);
  return sorted.map((f) => formatFile(snapshot.get(f)!)).join("\n\n");
}

export function buildChangeContext(
  snapshot: Snapshot,
  changes: ChangeDetectionResult,
): string {
  const parts: string[] = [];

  for (const file of changes.changedFiles) {
    const entry = snapshot.get(file);
    if (entry) {
      parts.push(formatFile(entry, "UPDATED"));
    }
  }

  for (const file of changes.deletedFiles) {
    parts.push(`--- ${file} [DELETED] ---`);
  }

  return parts.join("\n\n");
}

export function buildDirectoryTree(
  snapshot: Snapshot,
  changes: ChangeDetectionResult | null,
): string {
  const tree = new Map<string, string[]>();
  const fileStatus = new Map<string, string>();

  for (const filePath of snapshot.keys()) {
    const dir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : ".";
    if (!tree.has(dir)) tree.set(dir, []);
    tree.get(dir)!.push(filePath);

    if (changes) {
      if (changes.changedFiles.includes(filePath)) {
        fileStatus.set(filePath, " [CHANGED]");
      }
    }
  }

  if (changes) {
    for (const file of changes.deletedFiles) {
      const dir = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
      if (!tree.has(dir)) tree.set(dir, []);
      tree.get(dir)!.push(file);
      fileStatus.set(file, " [DELETED]");
    }
  }

  const dirs = [...tree.keys()].sort();
  const lines: string[] = [];
  for (const dir of dirs) {
    lines.push(`${dir}/`);
    const files = tree.get(dir)!.sort();
    for (const file of files) {
      const name = file.includes("/") ? file.substring(file.lastIndexOf("/") + 1) : file;
      const status = fileStatus.get(file) ?? "";
      lines.push(`  ${name}${status}`);
    }
  }
  return lines.join("\n");
}

export function buildQueryTurn(
  directoryTree: string,
  query: string,
  scope?: string,
  fileTypes?: string[],
  shardInfo?: { id: string; totalShards: number },
): string {
  const parts: string[] = [];

  if (shardInfo) {
    parts.push(`[分片: ${shardInfo.id}，共 ${shardInfo.totalShards} 个分片]`, "");
  }

  parts.push("目录树:", directoryTree, "");

  if (scope) parts.push(`搜索范围: ${scope}`);
  if (fileTypes?.length) parts.push(`文件类型限定: ${fileTypes.join(", ")}`);

  parts.push("", `查询: ${query}`);

  return parts.join("\n");
}

function formatFile(entry: FileEntry, tag?: string): string {
  const lines = entry.content.split("\n");
  const numbered = lines.map((line, i) => `${i + 1}\t${line}`).join("\n");
  const label = tag ? ` [${tag}]` : "";
  return `--- ${entry.relativePath}${label} (lines 1-${lines.length}) ---\n${numbered}`;
}
