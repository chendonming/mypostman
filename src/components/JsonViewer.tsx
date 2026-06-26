// ===== JSON 树形查看组件 =====
// 递归渲染 JSON 结构，支持任意层级折叠/展开
// 折叠状态使用路径字符串管理，默认全部展开
// 点击箭头按钮 ▶/▼ 切换折叠状态

import { useCallback, useState } from "react";

/** 渲染 JSON 原始值（null / boolean / number / string） */
function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-pulse-purple">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-pulse-purple">{value ? "true" : "false"}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-pulse-amber">{String(value)}</span>;
  }
  if (typeof value === "string") {
    return <span className="text-pulse-emerald break-all">"{value}"</span>;
  }
  return null;
}

/** 折叠/展开箭头按钮 */
function ToggleBtn({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center w-3.5 h-4 mr-[1px] text-pulse-text-muted hover:text-pulse-text-primary focus:outline-none select-none align-middle shrink-0"
    >
      <span className="text-[10px] leading-none">{expanded ? "▼" : "▶"}</span>
    </button>
  );
}

interface TreeNodeProps {
  path: string;
  value: unknown;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  prefix?: React.ReactNode;
  trailingComma?: boolean;
}

/** 递归渲染单个 JSON 节点 */
function TreeNode({
  path,
  value,
  depth,
  collapsed,
  onToggle,
  prefix,
  trailingComma,
}: TreeNodeProps) {
  const isObject = typeof value === "object" && value !== null;
  const isCollapsed = isObject && collapsed.has(path);
  const paddingLeft = depth * 16;

  // ===== 原始值（叶子节点）=====
  if (!isObject) {
    return (
      <div
        style={{ paddingLeft }}
        className="min-h-[1.25rem] flex items-start"
      >
        <span className="inline-block">
          {prefix}
          <JsonPrimitive value={value} />
          {trailingComma && <span className="text-pulse-text-muted">,</span>}
        </span>
      </div>
    );
  }

  // ===== 对象 / 数组 =====
  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  // 空对象/数组始终单行显示
  if (entries.length === 0) {
    return (
      <div
        style={{ paddingLeft }}
        className="min-h-[1.25rem] flex items-start"
      >
        <span className="inline-block">
          {prefix}
          <span className="text-pulse-text-primary">
            {bracketOpen}
            {bracketClose}
          </span>
          {trailingComma && <span className="text-pulse-text-muted">,</span>}
        </span>
      </div>
    );
  }

  // 折叠态 —— 单行预览
  if (isCollapsed) {
    return (
      <div
        style={{ paddingLeft }}
        className="min-h-[1.25rem] flex items-start"
      >
        <span className="inline-block">
          {prefix}
          <ToggleBtn expanded={false} onClick={() => onToggle(path)} />
          <span className="text-pulse-text-primary">{bracketOpen}</span>
          <span className="text-pulse-text-muted mx-1">
            {isArray ? `${entries.length} items` : `${entries.length} keys`}
          </span>
          <span className="text-pulse-text-muted">…</span>
          <span className="text-pulse-text-primary">{bracketClose}</span>
          {trailingComma && <span className="text-pulse-text-muted">,</span>}
        </span>
      </div>
    );
  }

  // ===== 展开态 =====
  return (
    <>
      {/* 起始括号行 */}
      <div
        style={{ paddingLeft }}
        className="min-h-[1.25rem] flex items-start"
      >
        <span className="inline-block">
          {prefix}
          <ToggleBtn expanded={true} onClick={() => onToggle(path)} />
          <span className="text-pulse-text-primary">{bracketOpen}</span>
        </span>
      </div>
      {/* 子节点 */}
      {entries.map(([key, val], i) => (
        <TreeNode
          key={key}
          path={isArray ? `${path}[${key}]` : `${path}.${key}`}
          value={val}
          depth={depth + 1}
          collapsed={collapsed}
          onToggle={onToggle}
          prefix={
            isArray ? undefined : (
              <>
                <span className="text-pulse-blue">"{key}"</span>
                <span className="text-pulse-text-muted">: </span>
              </>
            )
          }
          trailingComma={i < entries.length - 1}
        />
      ))}
      {/* 结束括号行 */}
      <div
        style={{ paddingLeft }}
        className="min-h-[1.25rem] flex items-start"
      >
        <span className="inline-block">
          <span className="text-pulse-text-primary">{bracketClose}</span>
          {trailingComma && <span className="text-pulse-text-muted">,</span>}
        </span>
      </div>
    </>
  );
}

/** ===== JSON 树形查看组件 =====
 *
 * 接收响应体和 Content-Type，自动判断是否需要解析。
 * JSON 内容以可折叠树形展示；非 JSON / 无效 JSON 原样输出。
 *
 * @param body - 响应体文本
 * @param contentType - Content-Type 头（用于判断是否为 JSON）
 */
export default function JsonViewer({
  body,
  contentType,
}: {
  body: string;
  contentType?: string | null;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // 空 body
  if (!body) {
    return (
      <div className="p-4 text-xs font-mono">
        <span className="text-pulse-text-muted italic">Empty response body</span>
      </div>
    );
  }

  // 非 JSON → 原样输出
  if (!contentType?.includes("json")) {
    return (
      <pre className="p-4 text-xs font-mono text-pulse-text-primary whitespace-pre-wrap break-all">
        {body}
      </pre>
    );
  }

  // 解析 JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // 解析失败 → 回退原始文本
    return (
      <pre className="p-4 text-xs font-mono text-pulse-text-primary whitespace-pre-wrap break-all">
        {body}
      </pre>
    );
  }

  return (
    <div className="p-4 text-xs font-mono leading-relaxed break-all">
      <TreeNode
        path="$"
        value={parsed}
        depth={0}
        collapsed={collapsed}
        onToggle={toggle}
      />
    </div>
  );
}
