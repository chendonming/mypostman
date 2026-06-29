# Pulse MCP 服务器快速开始

Pulse MCP 服务器让 AI Agent（如 Claude Code）能直接调用 Pulse 的 HTTP 请求调试功能。

## 安装

### 构建

```bash
# 从项目根目录构建 MCP 服务器
npm run mcp:build:release

# 构建产物位于 src-tauri/target/release/pulse-mcp
```

### 配置 MCP

在 `.claude/settings.local.json` 中添加：

```json
{
  "mcpServers": {
    "pulse": {
      "type": "stdio",
      "command": "/path/to/pulse-mcp",
      "args": []
    }
  }
}
```

将 `/path/to/pulse-mcp` 替换为实际路径，或确保 `pulse-mcp` 在 `$PATH` 中。

## 可用工具

| 工具名 | 说明 |
|--------|------|
| `send_request` | 发送 HTTP 请求（GET/POST/PUT/DELETE 等），返回完整响应 |
| `run_test_script` | 运行内联 YAML 测试脚本，返回断言结果 |
| `run_test_file` | 从文件路径加载 YAML 测试脚本并运行 |
| `list_collections` | 列出所有 API 集合及请求数量 |
| `get_collection_tree` | 树形展示各集合的请求方法和 URL |
| `get_collection_request` | 按名称获取集合中的某条请求配置 |
| `list_environments` | 列出所有环境及其变量数量 |
| `activate_environment` | 按名称激活环境 |

## 典型使用场景

### 场景 1：调试新 API

```
1. list_environments → 查看已有环境
2. activate_environment("production") → 激活生产环境
3. send_request(method="GET", url="{{base_url}}/api/health") → 检测 API 健康
```

### 场景 2：运行测试

```
1. run_test_file(path="examples/ai-agent/workflows/user-crud-test.yaml")
   → 运行完整的用户 CRUD 测试用例
```

### 场景 3：探索集合

```
1. list_collections → 查看有哪些集合
2. get_collection_tree → 查看完整的 API 结构
3. get_collection_request("用户API", "获取用户列表") → 查看请求详情
```

## 环境变量

Pulse 支持通过 `{{variable}}` 语法在 URL、请求头和请求体中使用变量替换。

变量来自 Pulse 的**环境**功能。在 MCP 工具调用中：

```json
{
  "method": "GET",
  "url": "{{base_url}}/users",
  "env_name": "开发环境"
}
```

- `env_name` 可选，如果不传则使用当前激活的环境
- 如果指定了 `env_name` 但不存在，则不会进行变量替换

## 用 CLI 替代

如果 MCP 不可用，也可直接使用 pulse-cli：

```bash
pulse request send -m GET https://api.example.com/users --json
```
