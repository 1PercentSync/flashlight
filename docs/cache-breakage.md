# Flashlight 缓存破坏场景

本文基于当前项目代码阅读整理，讨论实际使用中会导致缓存失效、局部重建或缓存状态不可信的情况；不考虑 DeepSeek 远端缓存自身 TTL 过期。

## 缓存层次

Flashlight 里有三层容易被混在一起的“缓存”：

1. DeepSeek 远端前缀缓存：由请求的 token 前缀完全一致触发，代码通过固定的消息顺序争取命中。
2. 工作区本地基线：`.flashlight/base.json`，用于单分片模式保存上一次完整代码上下文文本和文件 hash。
3. 工作区本地分片基线：`.flashlight/shard_meta.json` 和 `.flashlight/shard_*.json`，用于大项目按目录分片后的独立基线。

另外，`src/scanner.ts` 还有进程内的 `fileMetaCache`，它只减少同一进程内重复读文件和算 token 的成本；重启进程会丢失，但不会直接破坏 DeepSeek 前缀缓存。

## 一定会导致完整基线重建的情况

单分片模式下，以下情况会让 `.flashlight/base.json` 不再被复用，下一次查询会重新发送完整代码上下文：

1. `.flashlight/base.json` 不存在。
2. `.flashlight/base.json` JSON 解析失败或结构坏到无法按预期使用。
3. 新增文件和修改文件的 token 总量占旧 `base_token_count` 的比例超过 `FLASHLIGHT_CHANGE_THRESHOLD`，默认是 `0.1`。
4. 旧 `base_token_count <= 0` 时，变更比例会按 `1` 处理，因此有变更时基本会触发重建。
5. `FLASHLIGHT_CHANGE_THRESHOLD` 被调低后，原本还能增量发送的同一批变更可能超过新阈值并触发重建。

注意：删除文件不计入 `changeTokenRatio`。只删除文件时通常不会触发完整重建，而是复用旧 base，再追加 `[DELETED]` 标记。

## 会导致局部分片重建的情况

分片模式下，每个分片有自己的 `.flashlight/shard_<id>.json`。以下情况会让对应分片重建：

1. 对应分片基线文件不存在。
2. 对应分片基线文件 JSON 解析失败。
3. 分片内新增和修改文件的 token 比例超过 `FLASHLIGHT_CHANGE_THRESHOLD`。
4. 分片需要重建时 API 调用失败；代码只会在成功响应后写入新的 shard base，所以失败的分片会在下一次查询继续重建。

带 `scope` 查询时，只会查询相关分片。非相关分片即使被判定为需要重建，也不会在这次查询里成功写入新基线，之后查询到它们时仍会重建。

## 会导致所有分片缓存失效的情况

以下情况会让分片计划被视为变化，所有分片都以 `needRebuild` 处理：

1. `.flashlight/shard_meta.json` 不存在或解析失败。
2. 任意已记录分片当前 token 数超过 `FLASHLIGHT_MAX_CONTEXT_TOKENS`，代码会重新计算分片边界。
3. 删除或移动目录导致某个旧分片变为空；空分片会被裁剪，`planHash` 改变，剩余分片也会重建。
4. 调低 `FLASHLIGHT_MAX_CONTEXT_TOKENS` 后，旧分片装不下当前内容，触发重新分片。
5. 目录结构变化让重新计算出的 `id:prefix` 边界不同，例如某个目录膨胀后被递归拆成更细分片。

`cleanupShardFiles()` 会删除当前计划之外的旧 `shard_*.json`。一旦分片边界变化，旧边界对应的本地缓存文件会被清掉。

## 会破坏 DeepSeek 前缀命中的情况

本地基线是否重建和远端前缀是否命中不是一回事。下面这些变化会改变发送给 DeepSeek 的稳定前缀，即使本地 `.flashlight` 文件还在，也可能让远端前缀缓存 miss：

1. 系统提示文本变化：`getSystemInstructions()` 或 `getShardedSystemInstructions()` 的内容变了，前缀第一段就不同。
2. 完整重建后的 base 文本变化：文件内容、文件顺序、格式化模板、行号格式、头部标记等任何变化都会改变 `base_request_text`。
3. 代码升级改变 `formatFile()`、`buildBaseContext()`、`buildShardBaseContext()` 的输出格式。
4. 文件排序变化：完整重建时文件按 git 最近提交时间排序，未跟踪文件回退到 mtime。rebase、amend、重新提交、改变未跟踪文件 mtime，都可能让同一批文件的 base 顺序改变。
5. 行尾或编码变化：例如 CRLF/LF 转换会改变文件 hash 和 base 文本。
6. 模型或请求参数切换：代码把 `FLASHLIGHT_MODEL`、`FLASHLIGHT_REASONING_EFFORT` 传给 DeepSeek。即使 prompt 文本相同，服务端实际缓存通常会按模型或请求配置隔离，切换后不应假设还能命中。
7. 从单分片切到多分片，或从多分片切到单分片：消息中的 base 文本粒度和系统提示都会不同。

增量变更低于阈值时，旧 `base_request_text` 会被原样复用，变更文件作为后续消息追加。此时远端通常仍能命中“系统提示 + base”这段前缀，只有后追加的变更和查询部分 miss。

## 扫描范围变化带来的缓存问题

扫描范围由 `scanFiles()` 决定，实际文件集合变化会进一步影响本地和远端缓存：

1. 在 git 仓库中，扫描来自 `git ls-files --cached --others --exclude-standard`，包含已跟踪文件和未忽略的未跟踪文件。
2. 非 git 目录下，扫描递归目录并读取根 `.gitignore`。
3. `.flashlight/` 永远排除，不会因为日志或本地基线文件变化污染快照。
4. 修改 `.gitignore` 可能让未跟踪文件进入或离开快照。进入快照的新文件按新增文件计算 token，可能触发重建；离开快照的文件表现为删除，删除本身不计入重建比例。
5. 修改 `FLASHLIGHT_EXT_WHITELIST` 会改变被扫描的扩展名集合。新增进入白名单的文件会按新增文件处理；从白名单移出的文件会按删除处理。
6. 移动或重命名文件会表现为旧路径删除、新路径新增；新路径内容 token 会计入变更比例。
7. 改变 MCP workspace root 会换用新的 `.flashlight` 目录。即使文件内容相同，本地基线也会从空开始。

当前分片计划还有一个重要边界：已有 `shard_meta.json` 时，`resolveShardPlan()` 只按旧分片 prefix 收集文件。若新增了一个不属于任何旧 prefix 的顶层目录，只要旧分片都没有超出 token 预算，这批新文件可能不会进入任何分片计划。这更像是“缓存/索引状态不完整”的正确性风险，而不是正常的缓存失效。

## API 失败和并发导致的缓存状态

1. 单分片重建时，只有 DeepSeek 查询成功后才写入新的 `base.json`。如果 API 报错、无 tool call 重试后仍失败、流式响应缺 usage、tool 参数 JSON 解析失败，都不会保存新 base，下一次会继续重建。
2. 分片模式下，`shard_meta.json` 会在查询后写入，但需要重建的 shard 只有成功返回后才写入自己的 base。部分分片失败会留下“计划已更新，但部分分片基线缺失”的状态，后续只重建缺失或失败的分片。
3. 本地写入用 `.flashlight/dir.lock` 做短锁，并用 timestamp 防止较旧的查询覆盖较新的 base。并发查询通常不会互相覆盖，但旧查询如果先开始、后完成，可能因为 timestamp 较旧而跳过写入。
4. 如果锁目录残留超过 10 秒会被视为 stale 并删除。异常进程退出后通常能恢复，但手动操作 `.flashlight/dir.lock` 可能造成短期写入失败或并发写入风险。
5. 手动删除、修改或格式化 `.flashlight` 下的 JSON 文件会直接让本地缓存缺失、解析失败或状态不可信。

## 不会破坏稳定 base 前缀的常见操作

1. 改变 `query`、`scope`、`file_types`：它们只影响最后的查询消息，不改变已保存的 base 文本。
2. 低于阈值的文件修改：base 继续复用，变化作为增量上下文追加。
3. 只删除文件：通常复用旧 base，并追加 `[DELETED]` 标记。
4. 重启 Flashlight 进程：进程内 `fileMetaCache` 会丢失，但磁盘 `.flashlight` 基线仍可复用。
5. `.flashlight/flashlight.log` 增长：扫描时排除了 `.flashlight/`。

## 会让缓存“该失效却没失效”的风险

这些不是正常的缓存破坏，而是更危险的陈旧缓存风险：

1. `fileMetaCache` 只用相对路径、mtime 和 size 判断文件是否没变。如果某个工具在保持 mtime 和 size 不变的情况下改写文件，当前进程可能复用旧 content/hash/tokens，导致变更检测漏掉真实修改。
2. 删除文件不计入 `changeTokenRatio`。大量删除不会触发完整重建，旧 base 仍包含已删除内容，只靠后续 `[DELETED]` 消息纠正。
3. 分片模式下新增未被旧 prefix 覆盖的目录时，新文件可能完全不进入查询分片。
4. 已保存的 `base_request_text` 不会因 Flashlight 代码升级自动刷新。升级后如果系统提示变了，远端前缀可能 miss；如果只是 formatter 逻辑变了，本地仍会沿用旧 formatter 生成的 base，直到下一次重建。

## 快速判断

查看 `.flashlight/flashlight.log` 时，可以按这些日志判断缓存状态：

1. `no base.json found, rebuilding`：单分片本地基线缺失。
2. `change ratio exceeds threshold, rebuilding base`：单分片超过变更阈值。
3. `shard plan changed`：分片边界变化，所有分片按新计划处理。
4. `shard "<id>": rebuild`：该分片本次会发送完整分片上下文。
5. `shard "<id>": incremental`：该分片复用旧 base，只追加变更。
6. `usage: prompt=... (hit=..., miss=...)`：DeepSeek 实际前缀命中情况，以这里为准。
