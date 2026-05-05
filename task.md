# Flashlight 开发任务

## Phase 0: 项目初始化

- [X] 初始化 package.json（name, type:module, scripts, engines）
- [X] 配置 tsconfig.json
- [X] 安装核心依赖（`@modelcontextprotocol/server`, `openai`, `ignore`, `proper-lockfile`, `zod`）
- [X] 安装开发依赖（typescript, @types/node）

## Phase 1: 开发前验证

- [ ] DS API 基础连通测试（JSON Output + 流式传输 + 思考模式）
- [ ] 连续多轮 user 输入测试（无 assistant 间隔是否可行，不行则确认插入 "OK" 方案）
- [ ] 缓存探测可行性测试（建立缓存后探测 `prompt_cache_hit_tokens` 是否符合预期）

## Phase 2: 基础模块

### config.ts — 配置项定义与加载

- [ ] 定义配置类型（deepseek_api_key, ext_whitelist, model, reasoning_effort, change_threshold）
- [ ] 实现配置加载逻辑（从 MCP Server 初始化参数读取）

### tokenizer.ts — DeepSeek Tokenizer 纯 TS 移植

- [ ] 分析 Python tokenizer 实现，确定移植范围
- [ ] 实现 TS 版本的 tokenize / count 功能
- [ ] 验证与 Python 版本输出一致

### lock.ts — 文件锁

- [ ] 实现 `.flashlight/` 目录的加锁/解锁（基于 `proper-lockfile`）
- [ ] 确保锁只覆盖文件读写，不覆盖 API 调用

## Phase 3: 文件扫描与 Base 管理

### scanner.ts — 文件扫描

- [ ] 实现 .gitignore 规则加载与文件过滤（使用 `ignore` 包）
- [ ] 实现 ext_whitelist 文件类型过滤
- [ ] 实现文件排序：git commit 时间（回退到 mtime）
- [ ] 实现工作区快照创建（文件路径 + 内容 + hash）

### base.ts — Base 管理

- [ ] 实现 base.json 读取
- [ ] 实现 base.json 写入（含时间戳比较保护）
- [ ] 实现变更检测（快照 hash 与 base.json 中 file_hashes 对比）
- [ ] 实现变更区 token 占比计算（调用 tokenizer）

## Phase 4: 上下文拼接与 API 客户端

### context.ts — 上下文拼接

- [ ] 实现第一轮构造（cache_test_key + 系统指令）
- [ ] 实现 Base 上下文构造（全量文件，按排序规则，附行号标注）
- [ ] 实现变更上下文构造（变更文件完整内容 / 删除标注）
- [ ] 实现目录树构造（含文件版本位置标注）
- [ ] 实现查询轮构造（目录树 + scope/file_types + query）

### deepseek.ts — DS API 客户端

- [ ] 实现 OpenAI 客户端初始化（base_url, api_key）
- [ ] 实现缓存探测请求（发送 first_turn + 探测轮，解析 usage）
- [ ] 实现查询请求（流式传输，丢弃 reasoning_content，收集 content）
- [ ] 实现 JSON 响应解析（提取 file/start_line/end_line 列表）
- [ ] 实现 usage 信息提取（用于存储 base_token_count）

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
