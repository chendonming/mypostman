---
name: pulse-mcp-guide
description: >
  Pulse API 测试工具的 MCP 使用指南。
  仅通过 `/pulse-mcp-guide` 命令手动触发,用于查看 Pulse MCP 工具集合的正确用法、YAML 格式规范、以及常见错误避免。
disable-model-invocation: true
---

# Pulse MCP 使用指南

## 概述

Pulse 是一个桌面 API 测试工具（类似 Postman），通过 `pulse-mcp` MCP 服务器暴露 8 个工具供 AI Agent 调用。

**核心目的**：当你在处理与 API 测试、YAML 测试脚本、集合管理、环境变量、HTTP 请求相关的任务时，使用本指南确保正确调用 Pulse 的 MCP 工具。

**本指南解决的关键问题**：AI Agent 经常写出 OpenAPI 3.0 格式的 YAML 文件（如 `openapi: "3.0.0"`、`info:`、`paths:`、`components:`），而不是 Pulse 项目要求的 **CollectionDocument** 格式。这是最常见的错误——请务必读通"YAML 格式规范"章节。

---

## YAML 格式规范（CollectionDocument）

**这是本指南最重要的章节。** Pulse 使用自定义的 CollectionDocument YAML 格式，**不是 OpenAPI 3.0 / Swagger 格式**。这两种格式完全不兼容。

### 整体结构

```yaml
# ===== 顶层字段 =====
name: "集合名称"              # 必填
description: "集合描述"        # 可选
base_url: "https://api.example.com"  # 可选——请求可使用相对路径

# 集合级变量（{{variable}} 模板替换，优先级低于激活环境的同名变量）
variables:
  key1: "value1"
  key2: "value2"

# 集合级默认认证配置（可选）
auth:
  type: none               # none / bearer
  bearer_token: "xxx"      # type=bearer 时需要

# 请求列表（必填，至少一个）
requests:
  - name: "步骤名称"          # 必填
    method: GET              # 必填：GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS
    url: "/users"            # 必填：支持 {{variable}} 插值，可使用绝对或相对路径配合 base_url
    headers:                 # 可选
      Content-Type: "application/json"
    body: '{"key": "value"}' # 可选：JSON 或文本字符串
    content_type: "application/json"  # 可选：Content-Type 覆盖
    auth:                    # 可选：请求级认证，覆盖集合级
      type: inherit          # none / bearer / inherit
      bearer_token: "xxx"
    assertions:              # 可选：断言表达式列表
      - "status == 200"
      - "body.success == true"
      - "body.items[0].id == 1"
      - "body.data.name == '测试用户'"
      - "body.count >= 0"
      - "body.list contains expectedValue"
      - "headers.X-Custom != null"
      - "duration_ms < 5000"
    skip: false              # 可选：设为 true 临时跳过此请求
```

### 与 OpenAPI 3.0 的关键区别

| 方面 | Pulse CollectionDocument ✅ | OpenAPI 3.0 ❌ |
|------|---------------------------|----------------|
| 顶层字段 | `name`, `description`, `base_url`, `variables`, `auth`, `requests` | `openapi: "3.0.0"`, `info:`, `paths:`, `servers:`, `components:` |
| 请求列表 | 直接 `requests` 数组，每个请求含 `name`, `method`, `url` | 按路径分组的 `paths` 对象，嵌套 `get/post` 等 |
| 变量 | `variables` 键值对，`{{key}}` 模板替换语法 | 无直接等价 |
| 断言 | `assertions` 表达式数组 | 无此概念 |
| base_url | 顶层 `base_url` 字段，请求用相对路径 | `servers` 数组 |
| 认证 | `auth` 对象（`type: none/bearer/inherit`） | `securitySchemes` + `security` |

**如果你发现自己写出了类似下面的结构，请立即停止并改用 Pulse 格式：**

```yaml
# ❌ 错误——这是 OpenAPI 格式，Pulse 无法识别
openapi: "3.0.0"
info:
  title: My API
  version: "1.0"
paths:
  /users:
    get:
      summary: Get users
      responses:
        "200":
          description: OK
```

```yaml
# ✅ 正确——Pulse CollectionDocument 格式
name: "用户 API"
base_url: "https://api.example.com"
requests:
  - name: "获取用户列表"
    method: GET
    url: "/users"
    assertions:
      - "status == 200"
```

### 断言表达式语法

断言是形如 `<左值> <操作符> <右值>` 的字符串，支持以下格式：

| 语法 | 示例 | 说明 |
|------|------|------|
| `status == 200` | `status == 200` | 状态码相等比较 |
| `status != 404` | `status != 404` | 状态码不等比较 |
| `body.success == true` | `body.success == true` | JSON 布尔值相等 |
| `body.success != null` | `body.success != null` | 字段非 null 检查 |
| `body.name == 'test'` | `body.name == 'test'` | JSON 字符串值匹配（单引号包裹） |
| `body.items[0].id == 1` | `body.items[0].id == 1` | 数组索引访问 |
| `body.count >= 0` | `body.count >= 0` | 数值比较（支持 `>`, `>=`, `<`, `<=`） |
| `body contains hello` | `body contains hello` | 响应体包含子字符串 |
| `headers.X-Custom == 'value'` | `headers.X-Custom == 'value'` | 响应头匹配 |
| `duration_ms < 5000` | `duration_ms < 5000` | 耗时断言（毫秒） |

---

## MCP 工具速查表

`pulse-mcp` 服务器提供以下 8 个工具。以下按使用场景分组：

### 🔧 场景 1：发送 HTTP 请求

| 工具 | 用途 | 何时使用 |
|------|------|---------|
| **`send_request`** | 发送单次 HTTP 请求 | 用户说"调一下这个接口"、"发个请求"、"测试一下"/users 返回什么"时使用 |
| **参数** | `method`(必填), `url`(必填), `headers`, `body`, `content_type`, `env_name` | |

### 🔧 场景 2：运行测试脚本

| 工具 | 用途 | 何时使用 |
|------|------|---------|
| **`run_test_script`** | 运行 YAML 内联测试脚本 | 用户提供了 YAML 字符串内容时使用 |
| **参数** | `script_yaml`(必填), `env_name` | |
| **`run_test_file`** | 从文件路径加载 YAML 测试脚本运行 | `create_test_script` 刚生成脚本后，需要运行验证时使用 |
| **参数** | `path`(必填), `env_name` | |

### 🔧 场景 3：创建 YAML 测试文件

| 工具 | 用途 | 何时使用 |
|------|------|---------|
| **`create_test_script`** | 📌 创建/生成 YAML 格式的 API 测试脚本文件 | **任何时候需要创建 YAML 测试文件，都必须使用此工具**，切勿手动编写 YAML 文件并写入磁盘 |
| **参数** | `path`(必填), `name`(必填), `requests`(必填), `description`, `base_url`, `auth`, `variables` | |

**重要规则**：
- **必须使用 `create_test_script` 工具创建 YAML 文件**，不要直接 `Write` 文件
- `create_test_script` 内部使用 `serde_yaml` 序列化 CollectionDocument，确保格式完全正确
- 所有参数必须符合工具 schema 中定义的 JSON 结构——特别是 `requests` 是对象数组，每个对象包含 `name`, `method`, `url`（必填）和可选的 `headers`, `body`, `content_type`, `auth`, `assertions`, `skip`

### 🔧 场景 4：管理集合与环境

| 工具 | 用途 | 何时使用 |
|------|------|---------|
| **`list_collections`** | 列出所有集合 | 用户说"看看有哪些集合"、"浏览接口" |
| **`get_collection_tree`** | 树形结构展示集合 | 用户需要详细的接口结构时 |
| **`get_collection_request`** | 获取某个请求的配置 | 用户想查看某个具体接口的配置 |
| **`list_environments`** | 列出所有环境 | 查看可用环境及其变量 |
| **`activate_environment`** | 切换激活的环境 | 用户说"切换到XX环境"时 |

---

## 常见错误与预防

### ❌ 错误 1：写入 OpenAPI 3.0 格式的 YAML

```yaml
# 🚫 绝对不要生成这样的文件
openapi: 3.0.0
info:
  title: "My API"
paths:
  /users:
    get:
      summary: "Get users"
```

**原因**：AI Agent 被训练过大量 OpenAPI 数据，当要求"生成一个 API 描述文件"时容易默认用 OpenAPI 格式。

**正确做法**：
1. 使用 `create_test_script` 工具，通过其 JSON 参数结构生成 CollectionDocument
2. 或者按本指南的"YAML 格式规范"章节手动编写，用 `name`, `requests` 等顶级字段

### ❌ 错误 2：不用工具，手动写 YAML 文件

```bash
# 🚫 不要这样做——你的知识库里的 YAML 格式可能是错的
# Write 一个 test.yaml 文件到磁盘
```

**原因**：`create_test_script` 工具内部使用 `serde_yaml::to_string` 精确序列化，保证格式正确。手动编写可能写出 OpenAPI 格式或其他不兼容格式。

**正确做法**：始终调用 `create_test_script`，传入结构化参数，让它内部生成 YAML。

### ❌ 错误 3：headers 传成数组而不是对象

**错误参数**：
```json
{
  "headers": [{"key": "Content-Type", "value": "application/json", "enabled": true}]
}
```

**正确参数**：
```json
{
  "headers": {"Content-Type": "application/json"}
}
```

说明：`create_test_script` 和 `send_request` 的 headers 格式不同——`create_test_script` 的 headers 是**键值对对象**（`{"key": "value"}`），而 `send_request` 的 headers 是**数组对象**（`[{"key":"...", "value":"...", "enabled":true}]`）。注意区分。

### ❌ 错误 4：忘记传递必填参数

`create_test_script` 要求至少提供：`path`, `name`, `requests`（至少一个请求）。
每个请求必须包含：`name`, `method`, `url`。
缺少任何一个都会导致工具返回错误。

### ❌ 错误 5：requests 传成路径分组格式

```json
// 🚫 错误——这是 OpenAPI 风格的路径分组
{
  "requests": {
    "/users": {
      "get": { "name": "获取用户" }
    }
  }
}
```

```json
// ✅ 正确——requests 是扁平数组
{
  "requests": [
    { "name": "获取用户", "method": "GET", "url": "/users" }
  ]
}
```

---

## 工作流程示例

### 完整工作流：从创建测试到运行验证

```
1. [思考] 用户想要测试某个 API
   └─→ 用 list_collections 或 get_collection_tree 查看已有集合
   ├── 如果有对应集合 → 用 get_collection_request 查看具体请求
   └── 如果没有 → 进入步骤 2

2. [创建] 用户需要编写新的测试
   └─→ 用 create_test_script 创建 YAML 测试文件
       ├── path: "test-scripts/my-test.yaml"
       ├── name: "我的测试"
       ├── base_url: "https://api.example.com"
       └── requests: [...]
       └─→ 返回成功消息，包含文件路径

3. [运行] 用户想执行测试
   └─→ 用 run_test_file 运行已保存的脚本
       ├── path: "test-scripts/my-test.yaml"
       └─→ 返回每个请求的断言结果
   └── 或者用 run_test_script 运行内联 YAML
       └── script_yaml: "内联 YAML 内容"

4. [调试] 测试失败
   └─→ 用 send_request 单独发送请求查看实际响应
       ├── method: GET, url: "https://api.example.com/users"
       └─→ 返回完整响应，用于排查问题
```

### 变量与环境工作流

```
1. [查看] list_environments → 查看有哪些环境及其变量
2. [切换] activate_environment → 激活目标环境
3. [发送] send_request 或 run_test_script → 
        环境变量会自动用于 {{variable}} 替换
```

---

## 工具参数速查

### create_test_script 参数结构（JSON）

```json
{
  "path": "/absolute/path/to/test.yaml",
  "name": "测试脚本名称",
  "description": "可选描述",
  "base_url": "https://api.example.com",
  "auth": {
    "type": "bearer",
    "bearer_token": "your-token-here"
  },
  "variables": {
    "key1": "value1",
    "key2": "value2"
  },
  "requests": [
    {
      "name": "获取用户列表",
      "method": "GET",
      "url": "/users",
      "headers": {
        "Accept": "application/json"
      },
      "assertions": [
        "status == 200",
        "body.length > 0"
      ]
    },
    {
      "name": "创建用户",
      "method": "POST",
      "url": "/users",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": "{\"name\": \"test\", \"email\": \"test@example.com\"}",
      "content_type": "application/json",
      "auth": {
        "type": "inherit"
      },
      "assertions": [
        "status == 201",
        "body.id != null"
      ]
    }
  ]
}
```

### send_request 参数结构（JSON）

```json
{
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [
    {"key": "Authorization", "value": "Bearer xxx", "enabled": true}
  ],
  "body": "{\"key\": \"value\"}",
  "content_type": "application/json",
  "env_name": "Production"
}
```

---

## 如何将此 SKILL 安装到其他项目

### 复制安装

```bash
# 在目标项目根目录创建 skills 目录
mkdir -p .claude/skills/pulse-mcp-guide

# 复制 SKILL.md 到对应目录
cp /path/to/pulse-mcp-guide/SKILL.md .claude/skills/pulse-mcp-guide/SKILL.md
```

### 全局安装

```bash
# 复制到全局 skills 目录
cp -r /path/to/pulse-mcp-guide ~/.claude/skills/
```

### 使用方式

在对话中输入 `/pulse-mcp-guide` 即可触发本技能查看 MCP 工具的正确用法。
