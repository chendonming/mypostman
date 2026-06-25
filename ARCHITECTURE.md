# Pulse 技术架构文档

> Pulse 是一款跨平台桌面 HTTP 客户端工具（类似 Postman），用于 API 测试和调试。
> 本文档从技术角度描述项目的整体架构、技术选型、数据流和设计决策。

---

## 目录

1. [技术栈概览](#1-技术栈概览)
2. [项目结构](#2-项目结构)
3. [数据流架构](#3-数据流架构)
4. [双窗口架构](#4-双窗口架构)
5. [前端架构](#5-前端架构)
6. [Rust 后端架构](#6-rust-后端架构)
7. [持久化方案](#7-持久化方案)
8. [状态管理设计](#8-状态管理设计)
9. [认证继承体系](#9-认证继承体系)
10. [环境变量系统](#10-环境变量系统)
11. [日志系统](#11-日志系统)
12. [拖拽排序实现](#12-拖拽排序实现)
13. [设计系统与主题](#13-设计系统与主题)
14. [构建与部署](#14-构建与部署)
15. [已知限制与注意事项](#15-已知限制与注意事项)

---

## 1. 技术栈概览

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **桌面壳** | Tauri | v2 | 跨平台桌面应用（WebView2 渲染 + Rust 后端） |
| **前端框架** | React | 18.3 | UI 组件库 |
| **前端语言** | TypeScript | 5.6 | 类型安全的前端代码 |
| **构建工具** | Vite | 6 | 快速开发服务器和生产构建 |
| **样式** | Tailwind CSS | 3.4 | 原子化 CSS + 自定义设计系统 |
| **后端语言** | Rust | 2021 edition | Tauri 命令和 HTTP 请求执行 |
| **HTTP 客户端** | reqwest | 0.12 | Rust 侧发送 HTTP 请求 |
| **序列化** | serde / serde_json | 1.x | Rust <-> JS 的数据序列化 |
| **拖拽** | @dnd-kit | 6.x / 10.x | 集合和请求的拖拽排序 |
| **虚拟列表** | @tanstack/react-virtual | 3.x | 日志列表虚拟滚动 |
| **IPC** | @tauri-apps/api | 2.x | 前端调用 Rust 命令 |

---

## 2. 项目结构

```
mypostman/
├── index.html                     # HTML 入口（加载 Google 字体）
├── vite.config.ts                 # Vite 构建配置
├── tailwind.config.ts             # Tailwind 主题配置（pulse 调色板）
├── tsconfig.json                  # TypeScript 配置
├── postcss.config.js              # PostCSS 配置
├── package.json                   # 前端依赖和脚本
│
├── src/                           # 前端 React 源码
│   ├── main.tsx                   # 应用入口（窗口路由）
│   ├── App.tsx                    # 根组件（布局编排）
│   ├── LogViewer.tsx              # 日志窗口独立组件
│   ├── index.css                  # 全局样式 + CSS 组件类
│   ├── vite-env.d.ts              # Vite 环境类型声明
│   │
│   ├── types/
│   │   └── index.ts               # TypeScript 类型定义（与 Rust 结构体镜像）
│   │
│   ├── hooks/
│   │   └── usePulse.ts            # 单一状态管理 Hook（所有 app 状态）
│   │
│   └── components/
│       ├── Sidebar.tsx            # 侧边栏（集合/历史/环境 Tab + DnD）
│       ├── RequestPanel.tsx       # 请求面板（URL + 方法 + 参数/头/体）
│       ├── ResponsePanel.tsx      # 响应面板（状态 + 瀑布图 + 内容）
│       ├── AuthPanel.tsx          # 认证配置面板
│       ├── EnvironmentPanel.tsx   # 环境变量编辑器
│       └── WaterfallChart.tsx     # 请求耗时瀑布图
│
└── src-tauri/                     # Rust 后端源码
    ├── Cargo.toml                 # Rust 依赖清单
    ├── tauri.conf.json            # Tauri 应用配置
    ├── build.rs                   # Tauri 构建脚本
    ├── capabilities/default.json  # Tauri 权限配置
    └── src/
        ├── main.rs                # 程序入口（委托给 lib.rs）
        └── lib.rs                 # Tauri 命令 + 数据结构 + HTTP 请求逻辑
```

---

## 3. 数据流架构

### 核心原则：前端不直接调用 `fetch()`

```
┌─────────────────────────────────────────────────────────────────┐
│  React UI                    Rust Backend (Tauri)                │
│                                                                  │
│  App.tsx                                                         │
│    │                                                             │
│    ├─ invoke("send_request") ──────►  lib.rs: send_request()     │
│    │                                    │                       │
│    │                                    ├─ reqwest (HTTP) ──► Target API
│    │                                    │                       │
│    │◄─────── ResponseData ─────────────┘                       │
│    │                                                             │
│    ├─ listeners (http-log event) ◄─── lib.rs: app.emit()        │
│    │                          (LogViewer 实时接收)               │
│    │                                                             │
│    └─ invoke("get_logs") ──────────► lib.rs: get_logs()         │
│    └─ invoke("save_collections") ──► lib.rs: save_collections()  │
│    └─ invoke("load_environments")─► lib.rs: load_environments()  │
└─────────────────────────────────────────────────────────────────┘
```

### 请求生命周期

```
① 用户点击 Send 按钮 / 按 Ctrl+Enter
   │
② usePulse.sendRequest() 触发
   │
③ 认证继承链解析（inherit → 查集合 → 注入 Authorization 头）
   │
④ 获取当前环境激活的变量
   │
⑤ invoke<ResponseData>("send_request", { input, variables })
   │
⑥ Rust send_request 执行：
   ├─ 6a. {{variable}} 替换（URL/Headers/Body/Content-Type）
   ├─ 6b. 构建 reqwest 请求（60s 超时）
   ├─ 6c. 发送并测量耗时
   ├─ 6d. 估算各阶段时间（DNS/TCP/TLS/TTFB/Download）
   └─ 6e. 构建 LogEntry → 存储 + 发送 http-log 事件
   │
⑦ 前端收到 ResponseData → 渲染响应面板
   │
⑧ 历史记录更新（最多 50 条）
```

---

## 4. 双窗口架构

Pulse 使用 Tauri 的双窗口设计：

### 主窗口（main）

- **尺寸**: 1400×900（最小 900×600）
- **内容**: App 组件（Sidebar + RequestPanel + ResponsePanel）
- **标题**: "Pulse"

### 日志窗口（logs）

- **尺寸**: 900×550
- **内容**: LogViewer 组件（独立的 HTTP 日志查看器）
- **标题**: "Pulse - Logs"

### 窗口路由机制

`src/main.tsx` 中通过 `getCurrentWindow().label` 判断当前窗口：

```typescript
function Main() {
  const label = getCurrentWindow().label;
  if (label === "logs") return <LogViewer />;
  return <App />;
}
```

### 日志实时更新机制

Rust 后端在每次 `send_request` 执行完后调用 `app.emit("http-log", &log_entry)`，日志窗口通过 `listen("http-log", callback)` 监听该事件实现实时更新。同时 `LogViewer` 启动时还通过 `invoke("get_logs")` 获取完整历史记录，并使用 buffer 机制防止事件丢失。

---

## 5. 前端架构

### 组件树

```
App (usePulse)
├── Sidebar (240px, 固定宽度)
│   ├── Collections Tab
│   │   ├── DndContext > SortableContext
│   │   │   ├── SortableColHeader * N  (集合头部)
│   │   │   │   └── Auth 折叠区域
│   │   │   └── SortableRequestItem * M  (请求行)
│   │   └── New Collection 按钮
│   ├── History Tab
│   │   └── HistoryItem * N
│   └── Envs Tab
│       └── EnvironmentPanel
│           └── 环境列表 + 变量编辑器
│
├── RequestPanel
│   ├── URL Bar（方法选择器 + URL 输入 + 保存 + 发送）
│   ├── Auth Tab → AuthPanel
│   ├── Params Tab（Key-Value 编辑器）
│   ├── Headers Tab（Key-Value 编辑器）
│   └── Body Tab（Content-Type 选择 + 文本域）
│
└── ResponsePanel
    ├── Loading / Error / Empty / 响应 四态
    ├── 状态栏（状态码 + 耗时 + 大小）
    ├── WaterfallChart（DNS/TCP/TLS/TTFB/Download）
    └── Body Tab / Headers Tab
```

### 路由设计

本项目不使用 React Router。双窗口通过 Tauri 的窗口系统实现，内部无页面切换——所有内容在同一视图中通过 Tab 切换显示。

---

## 6. Rust 后端架构

### 核心文件：`src-tauri/src/lib.rs`

#### 数据结构

所有结构体均使用 `#[derive(Debug, Clone, Serialize, Deserialize)]`，与前端 TypeScript 接口镜像同步：

| Rust Struct | TypeScript Interface | 说明 |
|-------------|---------------------|------|
| `HeaderInput` | `HeaderInput` | HTTP 请求头/参数键值对 |
| `RequestInput` | （内联） | 前端传入的请求参数 |
| `ResponseData` | `ResponseData` | HTTP 响应数据 |
| `TimingInfo` | `TimingInfo` | 各阶段耗时 |
| `LogEntry` | `LogEntry` | 日志条目 |
| `LogStore` | （无前端口） | Rust 托管的日志存储 |
| `Environment`/`EnvironmentData` | `Environment`/`EnvironmentData` | 环境变量 |
| `EnvironmentVariable` | `EnvironmentVariable` | 单个环境变量 |

#### Tauri 命令清单（7 个）

| 命令 | 类型 | 说明 |
|------|------|------|
| `send_request` | 异步 | **核心命令**：发送 HTTP 请求，返回响应数据 |
| `get_logs` | 同步 | 获取所有日志条目 |
| `clear_logs` | 同步 | 清空日志存储 |
| `load_environments` | 同步 | 从磁盘加载环境变量 |
| `save_environments` | 同步 | 将环境变量持久化到磁盘 |
| `load_collections` | 同步 | 从磁盘加载集合数据 |
| `save_collections` | 同步 | 将集合数据持久化到磁盘 |

#### `send_request` 命令的 9 个步骤

1. **变量替换** — 对 URL/Headers/Body/Content-Type 执行 `{{key}}` → value 替换
2. **构建客户端** — 创建 reqwest `Client`（60 秒超时）
3. **装配请求头** — 过滤禁用项，将 `HeaderInput` 转为 `HeaderMap`
4. **装配请求体** — 如果提供了请求体则附加
5. **发送请求** — 记录发送开始时间 `Instant`
6. **处理响应** — 提取状态码、响应头、响应体、计算耗时
7. **估算各阶段时间** — 将 TTFB 的 35% 估算为连接时间，再分配 DNS(20%)/TCP(30%)/TLS(50%)
8. **构建日志条目** — 成功/失败统一记录到 `LogEntry`
9. **存储与通知** — 存入 `Mutex<LogStore>` 并 emit `http-log` 事件

---

## 7. 持久化方案

### 数据存储位置

使用 Tauri 的 `app.path().app_data_dir()` 获取操作系统标准的应用数据目录。

### 持久化文件

| 文件 | 内容 | 序列化格式 | 说明 |
|------|------|-----------|------|
| `environments.json` | 环境变量列表 + 激活 ID | JSON | 可手动编辑 |
| `collections.json` | 集合列表（含请求） | JSON | 通过 UI 创建/编辑 |

### 同步机制

前端使用 `useState` + `useEffect` 实现自动持久化：

```typescript
const [collectionsLoaded, setCollectionsLoaded] = useState(false);

// 启动加载
useEffect(() => {
  invoke("load_collections").then(data => { ... })
    .finally(() => setCollectionsLoaded(true));
}, []);

// 自动保存（跳过初始加载）
useEffect(() => {
  if (!collectionsLoaded) return;
  invoke("save_collections", { data: { collections } });
}, [collections, collectionsLoaded]);
```

关键设计：使用 `collectionsLoaded` / `envLoaded` 布尔标志**跳过初始加载完成前的自动保存**，防止空数据覆盖磁盘文件。

---

## 8. 状态管理设计

### 设计理念：单一 Hook + Props 穿透

本项目没有使用 Redux、Zustand、Context API 等状态管理库，而是将所有应用状态集中在 `usePulse()` 一个 hook 中，通过 props 逐层传递。这是对当前应用规模**刻意的简化选择**。

### 状态分组

```
usePulse()
├── Request（请求参数）
│   ├── method, url, headers, body, contentType
│   ├── authType, bearerToken
│   └── rawParams, requestTab
│
├── Response（响应）
│   ├── response, isLoading, error
│   └── responseTab
│
├── Persistence（持久化）
│   ├── collections, history
│   └── sidebarTab
│
├── Environment（环境）
│   ├── environments, activeEnvironmentId
│   └── envLoaded, collectionsLoaded
│
└── Editing（编辑状态）
    └── editingRequest (collectionId + requestId)
```

### 关键设计决策

| 决策 | 原因 |
|------|------|
| 单一 Hook | 避免 Context 重渲染问题，简化状态追踪 |
| Props 穿透 | 组件树较浅（3 层），穿透成本低且易于调试 |
| `useCallback` 包裹 | 防止子组件不必要的重渲染 |
| `useRef` 防循环 | URL ↔ Params 双向同步时防止死循环 |

### URL ↔ Params 双向同步

```typescript
const skipUrlSync = useRef(false);

// URL 变化 → 解析参数
const handleUrlChange = (newUrl) => {
  setUrl(newUrl);
  skipUrlSync.current = true;  // 标记来自 URL 的变化
  setRawParams(parseUrlParams(newUrl));
};

// 参数变化 → 重构 URL
useEffect(() => {
  if (skipUrlSync.current) { skipUrlSync.current = false; return; }  // 跳过
  const newUrl = buildUrlWithParams(base, rawParams);
  if (newUrl !== url) setUrl(newUrl);
}, [rawParams]);
```

---

## 9. 认证继承体系

Pulse 支持三层认证继承链：

```
集合级认证（Collection.authType / bearerToken）
    │
    ▼
请求级认证（RequestItem.authType / bearerToken）
    │
    ▼
运行时解析（sendRequest 时 resolve）
```

### 解析规则

- 请求设置 `inherit` → 查找所属集合的认证配置
- 集合也是 `inherit` → 降级为 `none`
- 请求未保存到集合 → 降级为 `none`
- `bearer` 类型 → 自动注入 `Authorization: Bearer <token>` 请求头

---

## 10. 环境变量系统

### 功能

- 创建多个环境（如：开发/测试/生产）
- 每个环境包含一组 `key-value` 变量
- 变量支持启用/禁用（禁用的变量在替换时被跳过）
- 通过 `{{variable_name}}` 语法在 URL/Headers/Body 中使用

### 替换流程

```
① 前端：获取激活环境中启用的变量列表 activeVars
② invoke("send_request", { ..., variables: activeVars })
③ Rust：substitute_variables() 遍历每个变量执行 replace
   for var in variables {
     result = result.replace("{{key}}", &var.value);
   }
```

### 注意

变量替换同时在前端（不存在）和 Rust 后端执行。Rust 侧的替换是最终的、权威的替换。

---

## 11. 日志系统

### 架构

```
send_request 执行
    │
    ├─ 构建 LogEntry
    │
    ├─ ❶ 存入 Rust Mutex<LogStore>（最大 2000 条，FIFO 淘汰）
    │
    ├─ ❷ app.emit("http-log", log_entry) → Tauri 事件
    │      │
    │      └─ LogViewer.listen("http-log") → 实时更新
    │
    └─❸ LogViewer 启动时 invoke("get_logs") → 完整历史
```

### 启动时的竞态处理

`LogViewer` 使用 buffer 策略防止事件丢失：

1. 先启动 `listen("http-log")` 事件监听
2. 事件到达时 push 到 `buffer` 数组
3. 并行执行 `invoke("get_logs")` 获取历史
4. 历史返回后，按 `id` 去重合并 buffer 中的事件

### LogEntry 结构

日志条目记录了请求和响应的完整信息（不是摘要），包括：
- 请求头（`Vec<HeaderInput>`）
- 请求体（已截断至 10000 字符）
- 响应头（`HashMap<String, String>`）
- 响应状态码、耗时、大小

---

## 12. 拖拽排序实现

### 技术选型

使用 `@dnd-kit` 库（比 react-beautiful-dnd 更轻量、更现代）。

### 实现方案

集合和请求项被**扁平化为一个列表**放入同一个 `SortableContext` 中：

```typescript
// ID 编码
const CP = "c:";                    // 集合前缀
const RP = "r:";                    // 请求前缀

// 集合项 ID: "c:<collectionId>"
// 请求项 ID: "r:<collectionId>:<requestId>"
```

### 拖拽后的目标定位

```
对排序后的扁平 ID 列表进行线性扫描：
1. 遇到 CP 前缀 → 记录 lastColId，重置 idx = 0
2. 遇到 RP 前缀 → 如果是被拖拽的项则停止，否则 idx++
3. 结果：目标集合 = lastColId，目标索引 = idx
```

### DnD 组件

| 组件 | 作用 |
|------|------|
| `DndContext` | 拖拽上下文 |
| `SortableContext` | 排序上下文（垂直列表策略） |
| `SortableColHeader` | 集合头部（可拖拽） |
| `SortableRequestItem` | 请求行（可拖拽） |
| `DragOverlay` | 拖拽时的幽灵效果 |

---

## 13. 设计系统与主题

### 调色板结构

```
pulse-deepest   (#0B0D15)  最深背景（最底层）
pulse-surface   (#12141D)  表面背景（卡片/面板）
pulse-elevated  (#1A1D28)  隆起层（悬浮元素）
pulse-hover     (#222638)  悬停高亮
pulse-border    (#2E3348)  边框线

pulse-accent     (#F0B429)  琥珀金强调色
pulse-accent-soft(#F6D055)  强调色柔和版
pulse-accent-dim (#C4941F)  强调色暗淡版

pulse-text-primary   (#E8EAF0)  主要文字
pulse-text-secondary (#9499B3)  次要文字
pulse-text-muted     (#656A82)  弱化文字
```

### HTTP 方法颜色

| 方法 | 颜色 | 色值 |
|------|------|------|
| GET | Teal | `#2DD4BF` |
| POST | Blue | `#60A5FA` |
| PUT | Amber | `#F0B429` |
| PATCH | Purple | `#A78BFA` |
| DELETE | Rose | `#FB7185` |
| HEAD | Emerald | `#34D399` |
| OPTIONS | Slate | `#94A3B8` |

### CSS 组件类（components layer）

| 类名 | 用途 |
|------|------|
| `.panel` | 卡片面板 |
| `.panel-header` | 面板头部 |
| `.btn-primary` | 主要操作按钮 |
| `.btn-ghost` | 次要/幽灵按钮 |
| `.input-field` | 文本输入框 |
| `.tab-active` / `.tab-inactive` | Tab 激活/非激活样式 |
| `.badge` | 小标签 |
| `.method-badge` | HTTP 方法标签 |

---

## 14. 构建与部署

### 开发模式

```bash
npm run tauri dev          # Tauri 完整开发（Vite HMR + Cargo 热重编译）
npm run dev                # 纯前端 Vite 开发（不启动 Rust）
```

**注意**：仅运行 `npm run dev` 时无法使用 HTTP 请求功能——所有请求通过 Tauri IPC 调用 Rust 执行。

### 生产构建

```bash
npm run build              # tsc 类型检查 + Vite 前端构建
npm run tauri build        # 完整 Tauri 生产构建（生成 .msi/.exe）
```

### 类型检查

```bash
npx tsc --noEmit           # TypeScript 类型检查（不生成文件）
cd src-tauri && cargo check # Rust 编译检查（快速）
```

---

## 15. 已知限制与注意事项

### 性能

- **DNS/TCP/TLS 时间估算**：reqwest 不提供原生分阶段计时，后端将 TTFB 的 35% 估算为连接时间，再按 20%/30%/50% 分配给 DNS/TCP/TLS。此数值仅供参考。
- **日志查看器**使用虚拟列表，但 `onScroll` 事件每次触发会重新渲染——对于极高频率的日志流可能造成性能压力。

### 数据安全

- **日志缓冲区**：`LogStore` 的最大容量为 2000 条（Rust 侧固定）。超出后旧日志被丢弃。
- **日志体截断**：请求/响应体超出 10000 字符时被截断（安全地在多字节字符边界处理，不会 panic）。

### 架构约束

- **`#[tauri::command]` 函数**不能标记为 `pub`（Rust 2021 edition 的宏命名空间与 Tauri v2 冲突）。
- **状态管理**使用单一 Hook + Props 穿透。如果应用规模继续增长，应考虑引入 Context 或轻量状态管理库。
- **同步机制**：环境变量和集合数据在每次状态变更时**完整写入** JSON 文件。如果数据量显著增大，可能需要引入增量持久化。

### 已知 Bug 列表

详细问题记录见 `bug-report.json`，主要问题摘要：

| # | 严重程度 | 文件 | 问题 |
|---|---------|------|------|
| 1 | HIGH | `lib.rs` | UTF-8 字符串切片边界（已修复） |
| 2 | HIGH | `LogViewer.tsx` | `get_logs` 未处理的 Promise 拒绝 |
| 3 | HIGH | `LogViewer.tsx` | 事件合并竞态条件 |
| 4-9 | MEDIUM/LOW | 多处 | 超时清除、DOM 直接操作、渲染优化等 |

---

## 词汇表

| 术语 | 含义 |
|------|------|
| **Collection** | 请求集合，包含多个 RequestItem 和共享的认证配置 |
| **RequestItem** | 单个 HTTP 请求定义（方法、URL、头、体、认证） |
| **Environment** | 环境变量集合，通过 `{{key}}` 语法注入到请求中 |
| **LogEntry** | 日志条目，记录一次 HTTP 请求的完整生命周期 |
| **LogStore** | Rust 侧托管的日志环形缓冲区（最大 2000 条） |
| **Tauri Command** | 前端通过 `invoke()` 调用的 Rust 函数 |
| **Tauri Event** | Rust 后端通过 `app.emit()` 发送的前端事件 |
| **TTFB** | Time To First Byte，首字节到达时间 |
| **Waterfall** | 瀑布图，直观展示请求各阶段耗时分布 |
