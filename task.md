# Flashlight 开发任务

## Phase 0: 项目初始化

- [X] 初始化 package.json（name, type:module, scripts, engines）
- [X] 配置 tsconfig.json
- [X] 安装核心依赖（`@modelcontextprotocol/server`, `openai`, `ignore`, `proper-lockfile`, `zod`）
- [X] 安装开发依赖（typescript, @types/node）

## Phase 1: 开发前验证

- [X] DS API 基础连通测试（JSON Output + 流式传输 + 思考模式）
- [X] 连续多轮 user 输入测试（无 assistant 间隔是否可行 → 可行）
- [X] 缓存机制研究（逆向确认：⌊total/128⌋×128 单元创建规则，方向性，无碰撞）

## Phase 2: 基础模块

### config.ts — 配置项定义与加载

- [X] 定义配置类型（deepseek_api_key, ext_whitelist, model, reasoning_effort, change_threshold）
- [X] 实现配置加载逻辑（从 MCP Server 初始化参数读取）

### tokenizer.ts — DeepSeek Tokenizer

- [X] 使用 `@huggingface/tokenizers` 加载 tokenizer.json
- [X] 实现 countTokens 功能
- [X] 验证与 DS API 实际计数一致

### lock.ts — 文件锁

- [X] 实现 `.flashlight/` 目录的加锁/解锁（基于 `proper-lockfile`）
- [X] 确保锁只覆盖文件读写，不覆盖 API 调用

### logger.ts — 日志（含缓存预测）

- [X] 实现 stderr 日志输出（info / warn / error 级别）
- [X] 实现缓存预测对比：记录 predicted_hit vs actual_hit，不一致时 warn

## Phase 3: 文件扫描与 Base 管理

### scanner.ts — 文件扫描

- [X] 实现 .gitignore 规则加载与文件过滤（使用 `ignore` 包）
- [X] 实现 ext_whitelist 文件类型过滤
- [X] 实现文件排序：git commit 时间（回退到 mtime）
- [X] 实现工作区快照创建（文件路径 + 内容 + hash）

### base.ts — Base 管理

- [X] 实现 base.json 读取
- [X] 实现 base.json 写入（含时间戳比较保护）
- [X] 实现变更检测（快照 hash 与 base.json 中 file_hashes 对比）
- [X] 实现变更区 token 占比计算（调用 tokenizer）

## Phase 4: 上下文拼接与 API 客户端

### context.ts — 上下文拼接

- [X] 实现第一轮构造（cache_test_key + 系统指令）
- [X] 实现 Base 上下文构造（全量文件，按排序规则，附行号标注）
- [X] 实现变更上下文构造（变更文件完整内容 / 删除标注）
- [X] 实现目录树构造（含文件版本位置标注）
- [X] 实现查询轮构造（目录树 + scope/file_types + query）

### deepseek.ts — DS API 客户端

- [X] 实现 OpenAI 客户端初始化（beta endpoint, api_key）
- [X] 实现缓存探测请求（发送 first_turn + 探测轮，解析 usage）
- [X] 实现查询请求（流式 + strict tool call schema，收集 tool_calls arguments）
- [X] 实现 JSON 响应解析（从 tool call 提取 file/start_line/end_line）
- [X] 实现 usage 信息提取 + 缓存预测日志
- [X] 实现 fire-and-forget 激活请求

## Phase 5: 结果提取与返回

### extractor.ts — 三档返回策略

- [ ] 实现从快照中按行号范围提取代码片段
- [ ] 实现 token 估算（保守字符数估算，25000 token 限制）
- [ ] 实现档位判断逻辑（完整文件 → 文件片段 → 纯索引）
- [ ] 实现各档位的格式化输出

## Phase 6: 主流程集成

### index.ts — MCP Server 入口

- [ ] 实现 MCP Server 注册（tool 定义：query, scope, file_types 参数）
- [ ] 实现查询主流程编排（快照 → 读 Base → 探测 → 决策 → 构造上下文 → 调用 API → 提取结果）
- [ ] 实现 Base 重建逻辑（缓存失效或变更超阈值时触发）
- [ ] 实现错误处理（所有错误显式报错，不重试）

## Phase 7: 收尾

- [ ] 端到端测试（完整流程从 MCP tool call 到返回结果）
- [ ] 确认 .flashlight/ 已加入 .gitignore
- [ ] 编写 README（安装配置说明）
