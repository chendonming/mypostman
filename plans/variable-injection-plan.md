# Collection 变量注入方案

## 问题描述

用户在 Pulse 中打开 Collection 中的请求并发送时，Collection 级别的 `variables`（如 `{{phone}}`、`{{password}}`、`{{token}}`）**没有被传入 `send_request`**，导致模板替换不生效。只有环境变量（Environment Variables）被传入。

## 根因分析

### 数据流断裂

```
前端 usePulse.ts:891
  activeVars = activeEnv.variables  // ← 只取了环境变量，没取 Collection 变量

前端 usePulse.ts:915
  invoke("send_request", { variables: activeVars })  // ← 只传了环境变量

Rust 端 lib.rs:127
  send_request(input, variables) {
    substitute_variables(url, &variables);  // ← 只替换传入的变量
  }
```

Collection 的 `variables` 字段虽然导入时正确持久化到了 `collections.json`，但从没有在发送请求时被使用。

### 现有的变量合并模式（确认优先级规则）

`test_runner.rs` 中有两种合并模式：

| 函数 | 优先级 | 场景 |
|---|---|---|
| `merge_variables` | 环境变量 < 脚本变量 | YAML 测试脚本运行 |
| `merge_collection_variables` | Collection 变量 < 环境变量 | Collection 测试运行 |

`send_request` 应遵循 `merge_collection_variables` 模式：**环境变量覆盖 Collection 变量**。

### 已有数据模型支持

Collection 和 TypeScript 类型已具有 `variables` 字段：

```typescript
// src/types/index.ts - Collection 接口
export interface Collection {
  // ...
  variables?: Record<string, string>;  // ← 已有，只缺用法
}
```

`tabEditingRequest` 字段已记录请求所属的 Collection：

```typescript
// src/types/index.ts - Tab 相关
editingRequest: { collectionId: string; requestId: string } | null;
```

## 修改方案

### 涉及文件

| 文件 | 修改类型 | 说明 |
|---|---|---|
| `src/hooks/usePulse.ts` | 修改 | 在 `sendRequest` 中合并 Collection 变量 |
| `src/hooks/usePulse.ts` | 新增函数 | 添加 `updateCollectionVariables` 和 `openCollectionVariablesEditor` |
| `src/components/Sidebar.tsx` | 修改 | 在 Collection 右键菜单/编辑区添加变量编辑器入口 |
| 新文件 | 新增组件 | `CollectionVariablesPanel.tsx` |

### 步骤 1：前端变量合并（核心修复）

**位置**：`src/hooks/usePulse.ts` 中 `sendRequest` 回调（约 891-923 行）

**修改**：在获取 `activeVars` 之后、调用 `invoke("send_request")` 之前，合并 Collection 变量。

```typescript
// 修改前（约 891-893 行）
const activeVars = activeEnv?.variables.filter((v) => v.enabled) ?? [];

// 修改后
const activeVars = mergeRequestVariables(
  activeEnv?.variables.filter((v) => v.enabled) ?? [],
  tabEditingRequest ? collections : [],
  tabEditingRequest?.collectionId,
);

// 新增合并函数（在 usePulse.ts 内或独立工具函数）
function mergeRequestVariables(
  envVars: EnvironmentVariable[],
  collections: Collection[],
  collectionId?: string,
): EnvironmentVariable[] {
  // 1. 找到所在 Collection
  const collection = collectionId
    ? collections.find((c) => c.id === collectionId)
    : null;

  // 2. 从 Collection 的 variables 构建基础 Map
  const merged = new Map<string, { value: string; enabled: boolean }>();
  if (collection?.variables) {
    for (const [key, value] of Object.entries(collection.variables)) {
      merged.set(key, { value, enabled: true });
    }
  }

  // 3. 环境变量覆盖（环境优先）
  for (const v of envVars) {
    if (v.enabled) {
      merged.set(v.key, { value: v.value, enabled: true });
    }
  }

  return Array.from(merged.entries()).map(([key, { value }]) => ({
    key,
    value,
    enabled: true,
  }));
}
```

**效果**：Collection 中定义的 `{{phone}}`、`{{password}}` 等变量会作为默认值生效，同名环境变量可覆盖。

### 步骤 2：Collection 变量编辑器 UI

**新建组件**：`src/components/CollectionVariablesPanel.tsx`

类似现有的 `EnvironmentPanel.tsx`，但更简化：

```
┌─ Collection 变量 ───────────────────┐
│                                     │
│  key       value      [操作]        │
│ ─────────────────────────────────   │
│  phone     13800...    [删除]       │
│  password  123456      [删除]       │
│  token                 [删除]       │
│  test_p...  2fbecc...  [删除]       │
│                                     │
│  [+ 添加变量]                       │
└─────────────────────────────────────┘
```

- 每行：key 输入框 + value 输入框 + 删除按钮
- 底部：「+ 添加变量」按钮
- 变量的新增/删除/修改即时同步到 `collections` 状态
- 有持久化保存按钮

**Sidebar 中的入口**：在 `Sidebar.tsx` 中，当选中某个 Collection 时，在其配置区域（目前已有 `base_url` 和 `auth` 编辑区）下方新增变量编辑区入口，或通过右键上下文菜单进入。

### 步骤 3：持久化

`updateCollectionVariables` 函数：

```typescript
const updateCollectionVariables = useCallback(
  (collectionId: string, variables: Record<string, string>) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId ? { ...c, variables } : c,
      ),
    );
    // 立即触发持久化（复用现有的 saveCollections）
    saveCollections();
  },
  [saveCollections],
);
```

现有的 `saveCollections` 命令已会将整个 `collections` 数组写入 `collections.json`，Collection 的 `variables` 字段会被自动序列化/反序列化。

## 影响范围

- **前端**：`usePulse.ts`、`Sidebar.tsx`，新增 `CollectionVariablesPanel.tsx`
- **Rust**：无需修改（`Collection.variables` 已完整支持序列化，`send_request` 接收合并后的单层变量列表）
- **数据格式**：无变化，向后兼容
- **测试**：现有 YAML 导入后，Collection 中 `{{key}}` 引用在发送时会被正确替换

## 验证方法

1. 导入 `trend-module-test.yaml` 测试文件
2. 在 Sidebar 中点击 Collection，展开变量编辑区，确认 `phone`、`password`、`token` 等变量可见
3. 编辑 Collection 变量值（如修改 phone）
4. 点击任一请求，Url/Header/Body 中使用 `{{phone}}` 的位置，观察发送时的实际值
5. 同名的环境变量应覆盖 Collection 变量
6. 修改后切换 tab 再回来，确认变量已持久化
