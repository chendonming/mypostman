# Pulse AI Agent 集成方案

> 使 Pulse（mypostman）接入 Claude Code 等 AI Agent 平台，让 AI 能直接调用 Pulse 测试 API

---

## 一、背景与现状

### 项目架构概览

```
pulse-cli (独立二进制)     Tauri GUI
     │                       │
     └─────── pulse-core (共享核心库) ────────┘
                     │
           HTTP 请求 + 变量替换 + 持久化
```

### 已有基础（良好）

- [x] `pulse-cli` 独立 CLI 二进制（~4MB），零 Tauri 依赖
- [x] `pulse-core` 共享库，封装了所有业务逻辑
- [x] `--json` 结构化输出模式
- [x] YAML 测试脚本引擎
- [x] 环境变量 `{{variable}}` 替换
- [x] Cargo workspace（`pulse-core` / `pulse-cli` / `pulse`)

### 缺口

- [ ] CLI 输出对 AI 不够友好（非 TTY 无法自动 JSON，错误信息非结构化）
- [ ] 缺少 AI Agent 原生集成协议（MCP - Model Context Protocol）
- [ ] 缺少集合内容的细粒度 CLI 查询（如按名称提取单条请求）
- [ ] 缺少 AI 使用指引

---

## 二、三阶段执行计划

---

## 阶段一：CLI AI 友好化改造

**目标**：先让 Claude Code 能通过 `! pulse request ...` 可靠调用

### 任务 1.1：非 TTY 环境自动 JSON 输出

- **文件**: `src-tauri/pulse-core/Cargo.toml`、`src-tauri/pulse-core/src/cli.rs`
- **内容**: 检测 stdout 是否连接终端，`!atty::is(atty::Stream::Stdout)` 时自动启用 `--json`
- **依赖**: 添加 `atty = "0.2"` 到 `pulse-core/Cargo.toml`
- **代码位置**: `cli.rs` 中 `Cli` 解析后的 `json_mode` 计算
- **估算**: 2h

### 任务 1.2：结构化错误输出

- **文件**: `src-tauri/pulse-core/src/cli.rs`
- **内容**: 所有命令 handler 返回统一 `Result<T, String>`，在顶层 `run()` 统一序列化为 JSON 错误
- **输出格式**:
  ```json
  {"ok": false, "error": "请求失败: Connection refused", "error_type": "connection", "code": 1}
  {"ok": true, "data": { ... }}
  ```
- **估算**: 4h

### 任务 1.3：新增 `request from-collection` / `request from-file` 子命令

- **文件**: `src-tauri/pulse-core/src/cli.rs`
- **新增子命令**:
  - `pulse request from-collection <集合名> <请求名>` — 按名称从集合数据中提取请求配置并发送
  - `pulse request from-file <JSON路径>` — 从 JSON 文件读取完整 `RequestInput` 后发送
- **说明**: AI 可以先 `pulse collections list` 查看集合，再用此命令执行特定请求
- **估算**: 4h

### 任务 1.4：新增 `pulse collection tree` 命令

- **文件**: `src-tauri/pulse-core/src/cli.rs`
- **输出**: JSON 树形结构，展示所有集合及其请求的方法、URL
  ```json
  {
    "collections": [
      {"name": "用户API", "requests": [
        {"name": "获取用户列表", "method": "GET", "url": "{{base_url}}/users"}
      ]}
    ]
  }
  ```
- **估算**: 2h

### 任务 1.5：响应摘要分析

- **文件**: `src-tauri/pulse-core/src/lib.rs`（新增函数）
- **内容**: 对 JSON 响应自动提取 JSON 路径结构，返回 `_analysis.json_paths` 和 body 前 2000 字符摘要
- **估算**: 3h

### 任务 1.6：更新构建脚本

- **文件**: `package.json`
- **内容**: 确保 `cli:build` / `cli:build:release` 命令正常工作
- **估算**: 0.5h

---

## 阶段二：MCP 服务器（核心）

**目标**：构建原生 MCP 服务器，让 Claude Code 能像调用函数一样调用 Pulse

### 架构

```
Claude Code
    │ MCP JSON-RPC over stdio
    ▼
pulse-mcp (新 crate)
    │ 直接调用 pulse_core::* 函数
    ▼
pulse-core (共享库)
    │ HTTP + 变量替换 + 导入导出 + 测试引擎
    ▼
  目标 API
```

### 任务 2.1：创建 `pulse-mcp` crate

- **新建**: `src-tauri/pulse-mcp/Cargo.toml`、`src-tauri/pulse-mcp/src/main.rs`
- **Cargo.toml 依赖**:
  ```toml
  [package]
  name = "pulse-mcp"
  version = "0.1.0"
  edition = "2021"

  [dependencies]
  pulse-core = { path = "../pulse-core" }
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  tokio = { version = "1", features = ["full"] }
  ```
- **更新 workspace**: `src-tauri/Cargo.toml` 的 `members` 中添加 `"pulse-mcp"`
- **估算**: 2h

### 任务 2.2：MCP JSON-RPC over stdio 协议实现

- **新建**: `src-tauri/pulse-mcp/src/protocol.rs`
- **实现内容**:
  - JSON-RPC 2.0 请求/响应解析
  - stdio 传输层（`tokio::io::stdin()` 读 → `stdout()` 写）
  - `method: "tools/list"` → 返回注册的工具列表
  - `method: "tools/call"` → 派发到对应 handler
  - 错误处理（`-32601` method not found 等标准错误码）
- **参考**: MCP 规范文档 `/protocol`，协议结构简单，~300 行即可完成
- **估算**: 4h

### 任务 2.3：注册 MCP 工具

- **新建**: `src-tauri/pulse-mcp/src/tools/` 目录
- **工具清单**:

| 工具名 | 功能 | 参数 | handler 逻辑 |
|--------|------|------|-------------|
| `send_request` | 发送 HTTP 请求 | method, url, headers?, body?, content_type?, env_name? | 加载环境变量 → 执行 `execute_http_request` → 返回 `ResponseData` |
| `run_test_script` | 运行 YAML 测试 | script_yaml (string), env_name? | 解析 YAML → 调用 `test_runner::run_test_script_internal` → 返回 `TestRunResult` |
| `run_test_file` | 从文件运行测试 | path, env_name? | 读文件 → 同上 |
| `list_collections` | 列出集合 | — | 加载 `collections.json` → 返回集合列表 |
| `get_collection_tree` | 集合树 | — | 同上但保留完整层级 |
| `get_collection_request` | 获取集合中某请求 | collection_name, request_name | 从集合 JSON 中按名称查找 → 返回请求配置 |
| `list_environments` | 列出环境 | — | 加载 `environments.json` → 返回环境列表 |
| `activate_environment` | 激活环境 | name | 加载环境 → 设置 active_id → 持久化 |

- **所有工具共享** `pulse_core::resolve_data_dir()` 定位数据文件
- **估算**: 6h

### 任务 2.4：MCP 工具 Input Schema 定义

每个工具的参数使用 JSON Schema 描述，Claude Code 自动以此生成调用参数。例如：

```rust
Tool::new("send_request")
    .description("发送 HTTP 请求并返回完整响应（含状态码、头、体、耗时）")
    .input_schema(json!({
        "type": "object",
        "properties": {
            "method": {
                "type": "string",
                "enum": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
                "description": "HTTP 方法"
            },
            "url": { "type": "string", "description": "请求 URL（支持 {{variable}} 插值）" },
            "headers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": { "type": "string" },
                        "value": { "type": "string" },
                        "enabled": { "type": "boolean" }
                    }
                },
                "description": "请求头列表（可选）"
            },
            "body": { "type": "string", "description": "请求体（可选）" },
            "content_type": { "type": "string", "description": "Content-Type（可选）" },
            "env_name": { "type": "string", "description": "激活的环境名称（可选）" }
        },
        "required": ["method", "url"]
    }))
```

### 任务 2.5：更新 workspace & 构建

- **文件**: `src-tauri/Cargo.toml`（更新 members）、`package.json`（新增 mcp 构建命令）
- **新增 npm script**:
  ```json
  {
    "mcp:build": "cargo build --manifest-path src-tauri/Cargo.toml --package pulse-mcp",
    "mcp:build:release": "cargo build --manifest-path src-tauri/Cargo.toml --package pulse-mcp --release"
  }
  ```
- **估算**: 1h

---

## 阶段三：Claude Code 集成配置

**目标**：让 Claude Code 开箱即用 Pulse

### 任务 3.1：MCP 服务器注册配置

- **新建**: `.claude/settings.local.json`
  ```json
  {
    "mcpServers": {
      "pulse": {
        "type": "stdio",
        "command": "pulse-mcp",
        "args": []
      }
    }
  }
  ```
- **说明**: 用户需将 `pulse-mcp` 二进制所在目录加入 `$PATH`，或将 `command` 改为绝对路径
- **估算**: 1h

### 任务 3.2：更新 CLAUDE.md

- **文件**: `CLAUDE.md`
- **追加内容**:
  ```markdown
  ## AI Agent 集成

  ### MCP 工具（推荐）
  项目提供 pulse-mcp MCP 服务器：
  - `send_request` — 发送 HTTP 请求（支持环境变量、Bearer Token）
  - `run_test_script` / `run_test_file` — 运行 YAML 测试脚本
  - `list_collections` / `get_collection_tree` — 浏览集合
  - `get_collection_request` — 获取集合中特定请求的配置
  - `list_environments` / `activate_environment` — 管理环境变量

  ### CLI 命令（备用）
  pulse-cli 二进制：非 TTY 环境自动输出 JSON
  - `pulse request -m GET <url>` — 发送请求
  - `pulse test <path>` — 运行测试脚本
  - `pulse collections list` — 列出集合
  - `pulse env list` — 列出环境
  - `pulse env use <name>` — 激活环境
  - `pulse export -f yaml` — 导出数据

  ### 典型工作流
  1. `list_collections` 查看可用 API
  2. `activate_environment` 选择环境
  3. `send_request` 发起测试
  4. `run_test_file` 运行完整的断言测试
  ```
- **估算**: 1h

### 任务 3.3：示例场景

- **新建**: `examples/ai-agent/` 目录
- **文件**:
  - `workflows/user-crud-test.yaml` — 用户 CRUD 完整测试脚本
  - `mcp-quickstart.md` — 快速开始文档
  - `prompts/api-workflow.txt` — 在 Claude Code 中可以直接粘贴的 prompt 示例
- **估算**: 3h

### 任务 3.4：MCP 服务器自动发现

- 确保构建后的二进制名称为 `pulse-mcp`（或 `pulse-mcp.exe`）
- 可以考虑通过 `--version` 输出兼容的 MCP 协议版本
- **估算**: 0.5h

---

## 三、工作量汇总

| 阶段 | 内容 | 预计工时 |
|------|------|---------|
| **一** | CLI AI 友好化改造 | **2-3 天** |
| └ 1.1 | 非 TTY JSON 检测 | 2h |
| └ 1.2 | 结构化错误输出 | 4h |
| └ 1.3 | `request from-collection/file` 命令 | 4h |
| └ 1.4 | `collection tree` 命令 | 2h |
| └ 1.5 | 响应摘要分析 | 3h |
| └ 1.6 | 构建脚本 | 0.5h |
| **二** | MCP 服务器开发 | **2-3 天** |
| └ 2.1 | 创建 crate 骨架 | 2h |
| └ 2.2 | JSON-RPC over stdio 协议 | 4h |
| └ 2.3 | 工具注册与 handler 实现 | 6h |
| └ 2.4 | Input Schema 定义 | 2h |
| └ 2.5 | Workspace 与构建 | 1h |
| **三** | 集成配置 | **0.5 天** |
| └ 3.1 | MCP 注册配置 | 1h |
| └ 3.2 | CLAUDE.md 更新 | 1h |
| └ 3.3 | 示例场景 | 3h |
| └ 3.4 | 自动发现 | 0.5h |
| **总计** | | **~1 周** |

---

## 四、注意事项

### 优先级建议

1. **阶段一优先**（最少的投入，立即可用）—— 做完后 AI 就能通过 `! pulse request ...` 调用
2. **阶段二是核心价值**—— MCP 使 AI 能"看见"工具签名，体验远超 shell 命令
3. **阶段三收尾**

### 技术选型要点

- **MCP SDK**: 推荐手动实现 JSON-RPC over stdio（协议简单 ~300 行），避免依赖社区 SDK 的不稳定性
- **pulse-core 不动**: 所有新增代码在 `pulse-mcp` 新 crate 和 `cli.rs` 中，核心库稳定
- **跨机器**: 所有文件都在项目目录中，`plans/` 本身也受 git 管理，git push/pull 即可同步

### CLI 与 MCP 关系

```
pulse request -m GET https://api.example.com/users    ← AI 备用
pulse-mcp: send_request(method="GET", url="...")       ← AI 主路径
```

两者底层都调用 `pulse_core::execute_http_request()`，行为完全一致。MCP 只是多了一层协议封装。

---

## 五、参考链接

- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Claude Code MCP 配置文档](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Pulse 项目 README_ZH.md](../README_ZH.md)
- [Pulse 架构文档](../ARCHITECTURE.md)
