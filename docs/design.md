# Flashlight MCP 设计文档

## 1. 概述

### 1.1 定位

Flashlight 是一个纯客户端 MCP Server，本地运行，用户自备 DeepSeek API Key。它将工作区代码全量塞入 DeepSeek 的 1M 上下文窗口，利用 LLM 的理解能力替代传统 RAG 检索，为 Coding Agent 提供高质量的代码检索服务。

### 1.2 解决的问题

Coding Agent 在大型代码库中查找代码效率低下：grep 依赖精确关键词，找到代码片段后缺乏全局理解，导致盲目修改。现有 RAG 方案噪音多或召回差，Augment Context Engine 价格昂贵且对复杂查询理解不足。

### 1.3 核心思路

DeepSeek V4 系列提供 1M 上下文、极低的缓存命中价格（flash: 0.02 元/百万 token）和较长的缓存存活时间，使"暴力全量上下文"方案在成本上可行。

---

## 2. 配置项

| 配置项 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `deepseek_api_key` | 是 | — | 用户自备的 DeepSeek API Key |
| `ext_whitelist` | 否 | 常见源代码后缀 | 文件类型白名单 |
| `model` | 否 | `deepseek-v4-flash` | DS 模型选择，可选 `deepseek-v4-pro` |
| `reasoning_effort` | 否 | `high` | 思考强度，可选 `high`、`max` |
| `change_threshold` | 否 | `0.1` | 变更区 token 占 Base token 比例阈值，超过则触发 Base 重建 |
| `max_context_tokens` | 否 | `900000` | 单分片最大 token 数，超过触发自动分片 |
| `keeper_url` | 否 | — | Keeper 服务 URL，设置后每次查询自动注册保活任务 |

---

## 3. Agent 调用接口

### 3.1 输入参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `query` | 是 | 自然语言描述所需内容 |
| `scope` | 否 | 相对工作区的目录搜索范围，仅作为查询 prompt 的一部分，不影响代码上下文构造 |
| `file_types` | 否 | 限定文件类型，只能在白名单基础上缩减，仅作为查询 prompt 的一部分 |

### 3.2 返回

匹配的代码内容，格式取决于三档返回策略（见第 6 节）。

---

## 4. 上下文拼接

### 4.1 多轮输入结构

上下文拆分为多轮 user 输入（需测试 DS 是否支持连续多轮 user，不支持则中间插入 assistant: "OK"）：

```
user[1]: "{cache_test_key},前面的是缓存测试key,可以忽略,你的任务是{系统指令}..."
user[2]: Base 上下文（全量工作区白名单文件，按老→新）
user[3]: 变更上下文（相对 Base 变化的文件完整内容 / 删除标注，按进入变更区时间升序）
user[4]: 目录树 + 查询（含 scope、file_types 限定）
```

第一轮将 cache 测试 key 与不变的系统指令合并，使缓存探测时能复用该轮的前缀缓存。

### 4.2 文件排序规则

- **Base 内文件**：按"老到新"排列。优先使用 git commit 时间（文件最后一次被 commit 修改的时间），无 git 环境时回退到文件系统 mtime。
- **变更区内文件**：按文件进入变更区的时间升序排列。越早进入变更区的文件排在前面，假设其越不可能再次变化，以最大化前缀缓存命中。

### 4.3 文件过滤

1. 先按 `.gitignore` 排除文件
2. 再按 `ext_whitelist` 过滤文件类型

### 4.4 目录树

目录树不仅展示项目结构，还标注每个文件的有效版本位置：

- 文件在 Base 中且未变更
- 文件已更新，有效版本在变更区
- 文件已删除

具体标注格式在实现时确定。

### 4.5 代码文件标注格式

采用 LLM 常见格式，预标注行号，便于 LLM 返回准确的行号范围。变更区文件标注为已更新，删除文件标注为已删除。具体格式在实现时确定。

---

## 5. 缓存策略

### 5.1 DS 缓存机制要点

- 缓存是前缀匹配：请求的 token 序列必须从头完全一致才能命中
- 上下文拼接顺序的设计目的：不变的 Base 在前，变化的内容在后，最大化前缀缓存命中
- 缓存 TTL 不固定，实测约 700 分钟仍有效，先验估计约 6 小时

#### 实测补充（2026-05-05）

1. **最低门槛**：total prompt < ~128 tokens 时不产生缓存，探测永远返回 0
2. **128 token 对齐**：缓存命中数（`prompt_cache_hit_tokens`）始终是 128 的整数倍，DS 按 128 token 块存储
3. **无碰撞**：不同文本前缀不会互相命中，缓存是精确前缀匹配
4. **公共前缀检测需要激活**：同一前缀至少发送两次请求后，系统才会将该前缀作为独立缓存单元落盘。首次探测必然返回 0，第二次才能命中

**对设计的约束**：
- `first_turn` 的 token 数必须 > 128，否则探测永远无法命中
- 每次查询完成后需额外发送一次"激活请求"，为下次探测建立公共前缀缓存

### 5.2 缓存探测

探测时构造两轮输入：

```
user[1]: "{cache_test_key},前面的是缓存测试key,可以忽略,你的任务是{系统指令}..."
user[2]: "当前是测试缓存是否依旧生效,直接回复OK"
```

判断标准：`prompt_cache_hit_tokens` 超过 `first_turn_token_count`（建立 Base 时用 tokenizer 预算并存储）的一半，即认为缓存存活。

### 5.3 每次查询的缓存决策流程

```
发起查询
  → 创建快照（内存中）
  → 获取锁 → 读取 Base 元数据 → 释放锁
  → 发送 cache 测试 key 探测缓存
  → 缓存存活？
      ├─ 是 → 对比快照与 Base 的文件哈希，识别变更文件
      │       → 变更区 token 占比超过阈值？
      │           ├─ 是 → 重建 Base
      │           └─ 否 → 复用 Base + 构造变更区
      └─ 否 → 重建 Base
  → 构造完整上下文
  → 如重建：获取锁 → 写入新 Base（时间戳比较，防止旧覆盖新）→ 释放锁
  → 调用 DS API
  → 解析 JSON 响应
  → 从快照提取代码
  → 按三档策略格式化返回
  → 如重建：异步发送短激活 + Base 激活（fire-and-forget）
  → 每次查询后：异步发送 Changes 激活（fire-and-forget，best effort）
```

#### 缓存激活请求

所有激活均异步、不阻塞返回结果、失败仅记录日志。

**重建后发送（并行）：**

| 类型 | 内容 | 创建的缓存单元 | 目的 |
|------|------|--------------|------|
| 短激活 | `[firstTurn, "OK"]` | ~512 tok | 供后续探测命中 |
| Base 激活 | `[firstTurn, base, "OK"]` | ~⌊(firstTurn+base)/128⌋×128 | 供后续查询命中 base 部分 |

**每次查询后发送：**

| 类型 | 内容 | 创建的缓存单元 | 目的 |
|------|------|--------------|------|
| Changes 激活 | `[firstTurn, base, changes, "OK"]` | ~⌊(firstTurn+base+changes)/128⌋×128 | 供下次查询命中 changes 部分（若 changes 未变） |

Changes 激活大部分 tokens 命中 Base 激活的缓存，实际 miss 仅为 changes 部分，成本极低。若下次查询时 changes 已变化，该单元自然失效，Base 激活的单元仍然兜底。

### 5.4 Base 重建触发条件

满足任一即重建：

1. 探测到 Base 缓存已失效
2. 变更区 token 占 Base token 比例超过配置阈值

### 5.5 已实现的扩展功能

- **分片（sharding）**：项目超过 `max_context_tokens` 时按目录自动拆分，并行查询，合并结果。详见 `shard.ts`
- **缓存保活（keeper）**：独立 Docker 服务定期激活缓存，防止过期。使用自适应 TTL 学习（sentinel 探测 + 24 小时桶 + per-model 隔离）。详见 `keeper/`
- 激活请求不做重试（失败后自愈）

---

## 6. 返回策略

### 6.1 LLM 返回格式

使用 DS 的 `response_format: {'type': 'json_object'}` 确保 JSON 输出。

JSON 列表，每项包含：

- `file`：文件路径（可重复，同一文件可能有多个相关片段）
- `start_line` / `end_line`：相关内容行号范围

### 6.2 三档返回策略

输出限制：25000 token（Claude Code 限制），采用保守字符数估算。

| 档位 | 条件 | 返回内容 |
|------|------|----------|
| 完整文件 | 涉及的完整文件总量未超限 | 完整文件内容 + 文件路径后附加相关行数列表 |
| 文件片段 | 完整文件超限，片段未超限 | 相关行号范围对应的代码片段 |
| 纯索引 | 片段也超限 | 仅返回文件路径和行号范围，Agent 自行读取 |

### 6.3 排列顺序

按 LLM 返回的顺序。完整文件模式下，按该文件首次出现在返回结果中的顺序排列。

---

## 7. 查询快照

- **目的**：防止 LLM 返回期间代码被修改导致行号错位
- **时机**：每次查询发起时，对工作区内所有白名单文件做快照
- **存储**：内存中
- **生命周期**：查询完成后立即丢弃
- **并发**：每个查询各自独立快照

---

## 8. 并发与锁

### 8.1 文件锁

`.flashlight/` 目录的读写均需加锁，防止多个实例同时修改。使用 `proper-lockfile` 库。

### 8.2 锁的持有范围

锁只覆盖 `.flashlight/` 的读取和写入阶段，不覆盖 DS API 调用。API 调用和基于快照的结果提取不持锁，允许并发。

### 8.3 写入保护

每次查询发起时记录查询时间戳（即快照创建时间）。写入新 Base 前，获取锁并读取现有 `base.json` 的 `timestamp`，仅当自己的查询时间戳 > 现有时间戳时才写入，否则放弃。确保后发起的查询可以覆盖先发起的，反之不行。

### 8.4 可接受的代价

- 并发查询可能导致重复重建 Base（浪费一次 API 调用费用）
- 探测和写入之间状态可能被其他查询修改

当前阶段只保障并发查询不出错，不优化浪费和延迟。

---

## 9. DS API 调用

### 9.1 模型配置

- 默认模型：`deepseek-v4-flash`
- 可配置为 `deepseek-v4-pro`
- 思考模式：开启（`thinking.type: "enabled"`）
- 思考强度：默认 `high`，可配置为 `max`

### 9.2 请求方式

- 使用 OpenAI 兼容格式（`openai` npm 包）
- JSON 输出：`response_format: {'type': 'json_object'}`
- DS 特有参数通过 `extra_body` 传入
- 开启流式传输（防止超时），丢弃思考内容（`reasoning_content`），等待流式完全结束后再解析 JSON

### 9.3 Token 计数

- **Base token 数**：建立时从 API 返回的 `usage` 获取，存入 `base.json`
- **第一轮 token 数**：建立时用官方 tokenizer 计算第一轮内容的 token 数，存入 `base.json`，用于缓存探测判断
- **变更区 token 数**：查询前用官方 tokenizer 计算

### 9.4 错误处理

目前所有错误（API 超时、上下文超 1M、JSON 格式异常、行号越界）均显式报错，不做重试和降级。

### 9.5 缓存日志

每次 DS API 请求后，基于已知缓存机制预测缓存命中情况，与实际返回对比：

- 记录：请求类型（探测/查询/激活）、total_prompt_tokens、predicted_hit、actual_hit
- 预测逻辑：根据已记录的历史缓存单元（⌊total/128⌋×128），判断当前请求是否应该命中
- 预测与实际一致：正常 log
- 预测与实际不一致：warn 级别日志，表明缓存机制可能已变更

日志输出到 stderr（MCP Server 的 stdout 被 transport 占用）。

---

## 10. 数据存储

### 10.1 目录

工作区下的 `.flashlight/` 文件夹。

### 10.2 存储文件

`base.json`，单个文件，包含：

```json
{
  "first_turn_text": "{cache_test_key},前面的是缓存测试key,可以忽略,你的任务是...",
  "first_turn_token_count": 123,
  "base_token_count": 456789,
  "base_request_text": "完整的 Base 请求文本（第二轮 user 输入）...",
  "file_hashes": {
    "src/index.ts": "abc123...",
    "src/utils.ts": "def456..."
  },
  "timestamp": 1234567890
}
```

---

## 11. 技术栈

| 组件 | 选择 |
|------|------|
| 语言 | TypeScript |
| 运行时 | Node.js |
| MCP SDK | `@modelcontextprotocol/sdk` |
| DS API | `openai` npm 包（OpenAI 兼容格式） |
| gitignore 解析 | `ignore` npm 包 |
| 文件锁 | `proper-lockfile` |
| Tokenizer | DS 官方 Python tokenizer 的纯 TS 移植 |

---

## 12. 项目结构

```
flashlight/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # MCP Server 入口，接收 tool call，调度查询流程
│   ├── scanner.ts           # 文件扫描，.gitignore + 白名单过滤，git/mtime 排序
│   ├── base.ts              # Base 管理，构建 / 读取 / 写入 / 变更检测
│   ├── context.ts           # 上下文拼接（cache key + base + 变更区 + 目录树 + 查询）
│   ├── deepseek.ts          # DS API 客户端，缓存探测，查询请求
│   ├── extractor.ts         # 结果提取，三档返回策略
│   ├── tokenizer.ts         # DS 官方 tokenizer 的纯 TS 移植
│   ├── lock.ts              # .flashlight/ 文件锁
│   ├── shard.ts             # 分片算法（大项目自动拆分）
│   ├── config.ts            # 配置项定义与加载
│   └── logger.ts            # 日志输出（含缓存预测对比）
├── keeper/                   # 缓存保活 Docker 服务
│   ├── src/
│   │   ├── index.ts         # HTTP 服务入口
│   │   ├── store.ts         # 内存任务存储
│   │   ├── scheduler.ts     # 后台调度（sentinel + 任务激活）
│   │   ├── sentinel.ts      # 一次性测试缓存，学习 TTL
│   │   ├── ttl.ts           # 自适应 TTL 估计器（24 小时桶 × per-model）
│   │   ├── probe.ts         # DeepSeek probe/activate 调用
│   │   └── log.ts           # 日志
│   ├── Dockerfile
│   └── docker-compose.yml
```

---

## 13. 开发前验证项

正式开发前需通过以下测试确认关键假设成立：

1. **DS API 基础连通**：使用 OpenAI 兼容格式调用 DS API，确认 JSON Output、流式传输、思考模式均正常工作
2. **连续多轮 user 输入**：测试是否允许连续发送多条 user 消息而不插入 assistant 回复。如不允许，确认中间插入 assistant: "OK" 后是否正常工作
3. **缓存探测可行性**：发送一次完整请求建立缓存后，用第一轮内容 + 探测第二轮的方式发送请求，验证 `prompt_cache_hit_tokens` 是否符合预期，确认以超过 `first_turn_token_count` 一半作为判断标准是否可靠
