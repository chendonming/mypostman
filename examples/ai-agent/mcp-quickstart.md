# Pulse MCP 服务器快速开始

Pulse MCP 服务器让 AI Agent（如 Claude Code）能直接调用 Pulse 的 HTTP 请求调试和测试功能。

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
| `create_test_script` | **创建可导入的 YAML 集合/测试文件**（推荐） |
| `list_environments` | 列出所有环境及其变量数量 |
| `activate_environment` | 按名称激活环境 |

## 典型使用场景

### 场景 1：调试新 API

```
1. list_environments → 查看已有环境
2. activate_environment("production") → 激活生产环境
3. send_request(method="GET", url="{{base_url}}/api/health") → 检测 API 健康
```

### 场景 2：创建并导入测试集合（推荐工作流）

`create_test_script` 会生成统一的 **Collection YAML** 格式，可**直接运行测试**，也可**导入为持久化集合**：

```
1. create_test_script(
     path="examples/api-test.yaml",
     name="用户 API",
     base_url="https://jsonplaceholder.typicode.com",
     variables={"content_type": "application/json"},
     requests=[
       {
         "name": "获取用户列表",
         "method": "GET",
         "url": "/users",
         "assertions": ["status == 200"]
       },
       {
         "name": "创建用户",
         "method": "POST",
         "url": "/users",
         "headers": {"Content-Type": "{{content_type}}"},
         "body": "{\"name\": \"测试用户\"}",
         "assertions": ["status == 201", "body.id != null"]
       }
     ]
   )
   → 生成 examples/api-test.yaml

2. run_test_file(path="examples/api-test.yaml")
   → 立即运行请求并验证断言

3. 在 Pulse GUI 中：文件 → 导入 → 选择 api-test.yaml
   → 成为持久化 Collection，可在侧边栏管理

4. 在侧边栏右键该集合 → "运行全部测试"
   → 再次运行所有断言
```

### 场景 3：运行测试

```
1. run_test_file(path="examples/ai-agent/workflows/user-crud-test.yaml")
   → 运行完整的用户 CRUD 测试用例
```

### 场景 4：探索集合

```
1. list_collections → 查看有哪些集合
2. get_collection_tree → 查看完整的 API 结构
3. get_collection_request("用户API", "获取用户列表") → 查看请求详情
```

## create_test_script 参数详解

`create_test_script` 支持完整描述一个 API 集合：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | ✅ | 保存路径 |
| `name` | string | ✅ | 集合名称 |
| `description` | string | ❌ | 描述 |
| `base_url` | string | ❌ | Base URL，请求可用相对路径 |
| `variables` | object | ❌ | 集合级默认变量 |
| `auth.type` | "none" \| "bearer" | ❌ | 集合级默认认证方式 |
| `auth.bearer_token` | string | ❌ | Bearer Token |
| `requests[]` | array | ✅ | 请求列表（至少一个） |

每个请求支持：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 请求名称 |
| `method` | string | ✅ | HTTP 方法 |
| `url` | string | ✅ | URL（支持 {{variable}}，可用相对路径） |
| `headers` | object | ❌ | 请求头键值对 |
| `body` | string | ❌ | 请求体 |
| `content_type` | string | ❌ | Content-Type |
| `auth.type` | "none" \| "bearer" \| "inherit" | ❌ | 认证方式，默认继承集合级 |
| `auth.bearer_token` | string | ❌ | Bearer Token |
| `assertions` | string[] | ❌ | 断言表达式 |
| `skip` | boolean | ❌ | true 跳过此请求 |

支持以下断言表达式：

- `status == 200` — 状态码等于
- `body.success == true` — JSON 字段等于
- `body.name != null` — JSON 字段不为空
- `body contains 关键字` — 响应体包含子串
- `duration_ms < 500` — 响应时间小于 500ms
- `headers.Content-Type == 'application/json'` — 响应头等于

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
- 集合级 `variables` 作为默认值，**环境变量具有更高优先级**

## 用 CLI 替代

如果 MCP 不可用，也可直接使用 pulse-cli：

```bash
pulse request send -m GET https://api.example.com/users --json
```
