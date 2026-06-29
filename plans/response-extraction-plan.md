# 响应提取（Response Extraction）方案

## 概述

支持从 HTTP 响应中提取 JSON 字段值并自动赋值给变量，使后续请求可以通过 `{{variable}}` 引用这些值。
典型场景：登录后自动提取 `$.data` 中的 `token`，后续请求直接使用 `{{token}}`。

## 需求分析

### 用户故事

1. 用户在 YAML 测试脚本中定义提取规则，运行测试时自动提取并传递值
2. 用户在 Pulse GUI 中 Collection 的请求上配置提取规则
3. 提取的值在测试脚本的请求序列中逐级传递
4. 提取的值也可用于断言（断言已有独立机制，这是追加功能）

### 示例 YAML

```yaml
requests:
  - name: "登录"
    method: POST
    url: "/auth/login"
    body: '{"phone": "{{phone}}", "password": "{{password}}"}'
    # 新增提取规则
    extract:
      - name: "token"           # 变量名 → {{token}}
        source: "body.data"     # JSON Path 来源
      - name: "user_id"
        source: "body.data.user.id"

  - name: "获取用户信息"
    method: GET
    url: "/user/{{user_id}}"
    headers:
      Authorization: "Authorization{{token}}"  # 提取的值在此被引用
```

## 架构设计

### 数据流

```
请求 1（登录）
  │ POST /auth/login { phone, password }
  │
  ▼
响应 1 ←─┬── 断言验证
          └── 提取规则执行
                ├── body.data → "abc123"  → 变量池 { token: "abc123" }
                └── body.data.user.id → 42  → 变量池 { token: "abc123", user_id: "42" }
  │
  │ 变量池传递给下一个请求
  ▼
请求 2（获取用户信息）
  │ GET /user/42
  │ Authorization: Authorizationabc123
  │
  ▼
响应 2 ←── 断言验证
          └── 提取规则执行（可选，追加到变量池）
```

### 变量优先级（运行时）

```
环境变量 < Collection 变量 < 提取变量（运行时最高优先级）
```

提取的变量在运行时临时覆盖同名变量，确保后续请求使用最新的提取值。

## 详细设计

### 涉及文件

| 文件 | 修改类型 | 说明 |
|---|---|---|
| `src-tauri/pulse-core/src/lib.rs` | 修改 | 添加 `ExtractRule` 结构体到共享类型 |
| `src-tauri/pulse-core/src/test_runner.rs` | 修改 | 核心：提取逻辑、变量池传递 |
| `src-tauri/pulse-core/src/io.rs` | 修改 | YAML 序列化/反序列化支持 `extract` |
| `src/types/index.ts` | 修改 | TypeScript 类型同步 |

### 1. Rust 数据结构

#### ExtractRule（共享类型）

**位置**：`src-tauri/pulse-core/src/lib.rs`

```rust
/// 响应提取规则：从响应中提取 JSON 值并赋给变量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractRule {
    /// 变量名（后续通过 {{name}} 引用）
    pub name: String,
    /// JSON Path 来源，如 "body.data"、"body.data.token"
    pub source: String,
}
```

#### TestRequest 和 CollectionItem 添加 extract 字段

```rust
// test_runner.rs - TestRequest
pub struct TestRequest {
    // ... 现有字段
    pub extract: Vec<ExtractRule>,  // ← 新增，默认空
}

// lib.rs - CollectionItem
pub struct CollectionItem {
    // ... 现有字段
    pub extract: Vec<ExtractRule>,  // ← 新增，默认空
}
```

#### CollectionDocumentItem 添加 extract 字段

**位置**：`io.rs`

```rust
pub struct CollectionDocumentItem {
    // ... 现有字段
    pub extract: Vec<ExtractRule>,  // ← 新增，默认空
}
```

### 2. 核心提取逻辑

**位置**：`src-tauri/pulse-core/src/test_runner.rs`

#### 步骤 2a：`execute_extract_rules` 函数

```rust
/// 执行提取规则，从响应中提取值并返回变量映射
fn execute_extract_rules(
    response: &ResponseData,
    rules: &[ExtractRule],
) -> HashMap<String, String> {
    let mut extracted = HashMap::new();

    for rule in rules {
        let parts: Vec<&str> = rule.source.splitn(2, '.').collect();
        let path = if parts.len() == 2 && parts[0] == "body" {
            parts[1]
        } else {
            &rule.source
        };

        // 尝试将响应体解析为 JSON
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&response.body) {
            // 复用现有的 resolve_json_path 函数
            if let Some(found) = resolve_json_path(&json_value, path) {
                let value_str = match found {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                extracted.insert(rule.name.clone(), value_str);
                continue;
            }
        }

        // 提取失败：插入空字符串或保留未设置
        // 这里选择插入空字符串，让调用方自行决定行为
        extracted.insert(rule.name.clone(), String::new());
    }

    extracted
}
```

#### 步骤 2b：修改 `execute_single_request`

**现有签名**：

```rust
async fn execute_single_request(
    req_item: &TestRequest,
    variables: &[EnvironmentVariable],
) -> TestStepResult
```

**修改后**（返回提取的变量）：

```rust
pub struct TestStepResult {
    // ... 现有字段
    pub extracted_variables: HashMap<String, String>,  // ← 新增：本次提取的变量
}

async fn execute_single_request(
    req_item: &TestRequest,
    variables: &[EnvironmentVariable],
) -> TestStepResult {
    // ... 现有逻辑 ...

    // 在请求执行后、断言验证后新增：
    let extracted = if !req_item.extract.is_empty() {
        execute_extract_rules(&response, &req_item.extract)
    } else {
        HashMap::new()
    };

    TestStepResult {
        // ... 现有字段 ...
        extracted_variables: extracted,
        // ... 继续 ...
    }
}
```

#### 步骤 2c：修改 `run_test_script_internal` — 变量池传递

```rust
pub async fn run_test_script_internal(
    yaml_content: &str,
    active_variables: &[EnvironmentVariable],
) -> TestRunResult {
    // ... 现有解析逻辑 ...

    // 步骤 2：合并变量
    let mut merged_vars = merge_variables(active_variables, &script.variables);

    // 步骤 3：逐个执行请求（带变量池传递）
    let mut steps = Vec::with_capacity(script.requests.len());
    let mut passed_steps = 0usize;

    for req_item in &script.requests {
        // 使用当前合并的变量执行请求
        let step_result = execute_single_request(req_item, &merged_vars).await;

        // 合并提取的变量到变量池（提取变量优先级最高）
        if !step_result.extracted_variables.is_empty() {
            for (k, v) in &step_result.extracted_variables {
                // 替换或插入
                if let Some(existing) = merged_vars.iter_mut().find(|ev| ev.key == *k) {
                    existing.value = v.clone();
                } else {
                    merged_vars.push(EnvironmentVariable {
                        key: k.clone(),
                        value: v.clone(),
                        enabled: true,
                    });
                }
            }
        }

        if step_result.passed {
            passed_steps += 1;
        }
        steps.push(step_result);
    }

    // ...
}
```

#### 步骤 2d：修改 `run_test_on_requests` — Collection 测试的变量池

同样修改 `execute_request_item` 和 `run_test_on_requests`，逻辑相同。

**修改 `execute_request_item`**：

```rust
/// 为 Collection 测试模式添加提取变量返回
async fn execute_request_item(
    req_item: &CollectionItem,
    variables: &[EnvironmentVariable],
) -> TestStepResult {
    // ... 与 execute_single_request 类似 ...
    // 添加提取规则处理
}
```

**修改 `run_test_on_requests`**：

```rust
pub async fn run_test_on_requests(
    requests: &[CollectionItem],
    script_name: &str,
    collection_vars: &Option<HashMap<String, String>>,
    active_variables: &[EnvironmentVariable],
) -> TestRunResult {
    // ...
    let mut merged_vars = merge_collection_variables(active_variables, collection_vars);

    for req_item in requests {
        // 使用 merged_vars（包含之前提取的变量）
        let step_result = execute_request_item(req_item, &merged_vars).await;

        // 合并提取的变量
        for (k, v) in &step_result.extracted_variables {
            if let Some(existing) = merged_vars.iter_mut().find(|ev| ev.key == *k) {
                existing.value = v.clone();
            } else {
                merged_vars.push(EnvironmentVariable {
                    key: k.clone(),
                    value: v.clone(),
                    enabled: true,
                });
            }
        }
        // ...
    }
}
```

### 3. YAML 序列化支持

**位置**：`src-tauri/pulse-core/src/io.rs`

#### `CollectionDocumentItem` 添加 extract

```rust
pub struct CollectionDocumentItem {
    // ... 现有字段 ...
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extract: Vec<ExtractRule>,
}
```

`collection_document_to_test_script` 和 `collection_document_to_collection` 中的转换函数需要同步复制 `extract` 字段。

```rust
fn collection_document_to_test_script(doc: &CollectionDocument) -> TestScriptType {
    // ... 现有逻辑 ...
    let requests = doc.requests.iter().map(|item| {
        TestRequest {
            // ... 现有字段 ...
            extract: item.extract.clone(),  // ← 新增
        }
    }).collect();
    // ...
}
```

```rust
fn collection_document_to_collection(doc: &CollectionDocument, id: &str) -> Collection {
    // ... 现有逻辑 ...
    let requests = doc.requests.iter().map(|item| {
        CollectionItem {
            // ... 现有字段 ...
            extract: item.extract.clone(),  // ← 新增
        }
    }).collect();
    // ...
}
```

#### `collection_to_collection_document` 反向转换

```rust
impl From<&CollectionItem> for CollectionDocumentItem {
    fn from(item: &CollectionItem) -> Self {
        // ...
        extract: item.extract.clone(),  // ← 新增
        // ...
    }
}
```

#### `TestScript` 结构的 extract 序列化支持

```rust
// test_runner.rs
pub struct TestRequest {
    // ... 现有字段 ...
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extract: Vec<ExtractRule>,
}
```

### 4. TypeScript 类型同步

**位置**：`src/types/index.ts`

```typescript
/** 响应提取规则 */
export interface ExtractRule {
  /** 变量名（后续通过 {{name}} 引用） */
  name: string;
  /** JSON Path 来源，如 "body.data" */
  source: string;
}

/** 请求项（Collection 中的请求） */
export interface RequestItem {
  // ... 现有字段 ...
  extract?: ExtractRule[];
}
```

### 5. MCP 工具适配

**位置**：`pulse-mcp/src/main.rs`

- `create_test_script` MCP 工具：支持传入 `extract` 规则
- `send_request` MCP 工具：返回的 `_analysis` 中可包含提取提示
- `run_test_file` / `run_test_script`：自动处理提取规则（因底层用 `run_test_script_internal`，会自动获得支持）

### 6. CLI 适配

**位置**：`src-tauri/pulse-core/src/cli.rs`

CLI 的 `test` 命令内部调用 `run_test_script_internal`，所以提取规则会自动生效。无需额外修改。

### 7. GUI 编辑支持（后续迭代）

Collection 请求编辑器中添加 `extract` 规则配置界面：

```
请求编辑器
├── Method + URL
├── Headers
├── Body
├── Auth
├── Assertions
└── Extract（新增标签页或区域）
    ├── [+] 添加提取规则
    │    ├── 变量名: [token         ]
    │    └── JSON Path: [body.data]
    └── ...
```

提取规则的编辑可通过现有的 `updateCollectionRequest` 函数持久化，因为 `RequestItem.extract` 是请求的组成部分。

## 实现阶段

### 第一阶段：Core 逻辑（Rust）

1. 在 `lib.rs` 中添加 `ExtractRule` 结构体
2. 在 `test_runner.rs` 中添加 `execute_extract_rules` 函数
3. 修改 `TestRequest`、`TestStepResult` 结构体
4. 修改 `execute_single_request` 以执行提取并返回结果
5. 修改 `run_test_script_internal` 以实现变量池传递
6. 同步修改 `execute_request_item` 和 `run_test_on_requests`

### 第二阶段：序列化 + 类型同步

7. 修改 `io.rs` 中的 `CollectionDocumentItem` 和转换函数
8. 同步 TypeScript 类型 `src/types/index.ts`

### 第三阶段：GUI（可选，后续）

9. 创建集合请求的 Extract 编辑 UI

### 第四阶段：测试

10. 编写 YAML 测试脚本验证提取 → 传递 → 使用流程

## 验证方法

### 测试场景 1：YAML 测试脚本提取

```yaml
# 简化版测试
name: "提取测试"
variables:
  phone: "13800138000"
  password: "123456"
requests:
  - name: "登录"
    method: POST
    url: "/auth/login"
    body: '{"phone": "{{phone}}", "password": "{{password}}"}'
    extract:
      - name: "token"
        source: "body.data"
    assertions:
      - "status == 200"
      - "body.data != null"

  - name: "获取用户信息(提取后的 token)"
    method: GET
    url: "/user/info"
    headers:
      Authorization: "Authorization{{token}}"
    assertions:
      - "status == 200"
```

导入此 YAML 并运行，观察：
1. 登录请求的响应中提取 `body.data` → `{{token}}`
2. 第二个请求的 `Authorization` header 中 `{{token}}` 被替换为提取的值
3. 断言全部通过

### 测试场景 2：多步提取链

```yaml
requests:
  - name: "登录"
    extract:
      - name: "token"
        source: "body.data"
      - name: "user_id"
        source: "body.data.user.id"

  - name: "获取用户详情"
    url: "/user/{{user_id}}"
    headers:
      Authorization: "Authorization{{token}}"

  - name: "用户动态列表"
    url: "/user/{{user_id}}/posts"
```

### 单元测试

1. 构造 Mock 响应，验证 `execute_extract_rules` 能从 JSON 中正确提取值
2. 验证 JSON Path 解析兼容嵌套、数组下标等复杂路径
3. 验证提取失败时返回空字符串
4. 验证变量池中提取的变量正确覆盖同名环境变量

### 集成测试

通过 Pulse CLI 运行包含 extract 规则的 YAML 测试脚本，验证全流程。

## 向后兼容性

- `ExtractRule` 使用 `#[serde(default)]` + `#[serde(skip_serializing_if)]` — 旧 YAML 不含 `extract` 字段时正常解析
- `extract` 为空 `Vec` 时，行为与目前完全一致
- 所有现有断言、变量替换逻辑不变
