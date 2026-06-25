import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LogEntry } from "./types";

// ============================================================
// 日志查看器常量
// ============================================================

const MAX_ENTRIES = 2000;   // 日志存储上限（与 Rust 侧一致）
const ROW_HEIGHT = 36;      // 虚拟列表中每行高度（px）
const PANEL_WIDTH = 420;    // 详情面板宽度（px）

/** 状态码颜色映射（按首位数字分类） */
const STATUS_COLORS: Record<string, string> = {
  "2": "text-pulse-emerald",
  "3": "text-pulse-amber",
  "4": "text-pulse-rose",
  "5": "text-pulse-rose",
};

/** HTTP 方法颜色映射 */
const METHOD_COLORS: Record<string, string> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  PATCH: "text-method-patch",
  DELETE: "text-method-delete",
};

/** 根据状态码返回颜色 class */
function statusClass(status: number): string {
  if (status === 0) return "text-pulse-rose";
  return STATUS_COLORS[String(status)[0]] ?? "text-pulse-text-secondary";
}

/** 根据 HTTP 方法返回颜色 class */
function methodClass(method: string): string {
  return METHOD_COLORS[method] ?? "text-pulse-text-secondary";
}

/** 格式化时间戳为 HH:mm:ss */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

/** 截断过长 URL（超过 max 字符后加 …） */
function truncateUrl(url: string, max = 120): string {
  return url.length <= max ? url : url.slice(0, max) + "…";
}

// ============================================================
// 复制按钮组件（自包含，无模块级状态）
// ============================================================

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleClick = useCallback(async () => {
    // 优先使用 Clipboard API，降级到 document.execCommand
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [text]);

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <button onClick={handleClick} className="btn-ghost text-[10px] py-0.5 px-2">
      {copied ? "Copied!" : label}
    </button>
  );
}

// ============================================================
// 响应头/请求头表格
// ============================================================

function HeaderTable({
  headers,
}: {
  headers: Record<string, string> | { key: string; value: string; enabled: boolean }[];
}) {
  const rows = Array.isArray(headers)
    ? headers.filter((h) => h.key.trim())
    : Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));

  if (rows.length === 0) {
    return <p className="text-pulse-text-muted text-xs italic px-4 py-2">(none)</p>;
  }

  return (
    <table className="w-full text-xs font-mono border-collapse">
      <tbody>
        {rows.map((row) => {
          const [k, v] = Array.isArray(row) ? row : [row.key, row.value];
          return (
            <tr key={`${k}\x00${v}`} className="border-b border-pulse-border/20">
              <td className="px-4 py-1.5 text-pulse-accent whitespace-nowrap align-top w-[35%]">
                {k}
              </td>
              <td className="px-4 py-1.5 text-pulse-text-primary break-all">{v}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 可复用的代码块区域（标签 + 复制按钮 + 预格式化内容） */
function CopyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-pulse-text-secondary uppercase tracking-wider">
          {label}
        </span>
        <CopyButton text={text} />
      </div>
      <pre className="bg-pulse-deepest rounded border border-pulse-border p-2 text-xs text-pulse-text-primary overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
        {text || <span className="text-pulse-text-muted italic">(empty)</span>}
      </pre>
    </div>
  );
}

// ============================================================
// 日志详情面板（从右侧滑入）
// ============================================================

function DetailPanel({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const headersText = entry.request_headers
    .filter((h) => h.key.trim())
    .map((h) => `${h.key}: ${h.value}`)
    .join("\n");

  const respHeadersText = Object.entries(entry.response_headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  // 构建"全部复制"的内容
  const copyAllText = [
    `${entry.method} ${entry.url}`,
    `Status: ${entry.status} ${entry.status_text}`,
    `Time: ${entry.total_ms.toFixed(0)}ms  Size: ${entry.size_label}`,
    "",
    "── Request Headers ──",
    headersText,
    ...(entry.request_body
      ? ["", "── Request Body ──", entry.request_body]
      : []),
    ...(Object.keys(entry.response_headers).length > 0
      ? ["", "── Response Headers ──", respHeadersText]
      : []),
    ...(entry.error ? ["", "── Error ──", entry.error] : []),
  ].join("\n");

  return (
    <>
      {/* 半透明遮罩层 */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* 详情面板（固定定位，从右侧滑入） */}
      <div
        className="fixed top-0 right-0 h-full z-50 bg-pulse-surface border-l border-pulse-border shadow-2xl overflow-hidden"
        style={{ width: PANEL_WIDTH }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-pulse-border shrink-0">
          <span className="text-xs font-semibold text-pulse-text-primary tracking-wide uppercase">
            Request Detail
          </span>
          <div className="flex items-center gap-1">
            <CopyButton text={copyAllText} label="Copy All" />
            <button
              onClick={onClose}
              className="btn-ghost text-xs px-2 py-1"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto h-[calc(100%-40px)]">
          {/* 请求概要 */}
          <div className="px-4 py-3 space-y-1.5 border-b border-pulse-border/40">
            <div className="flex items-center gap-2">
              <span className={`method-badge ${statusClass(entry.status)}`}>
                {entry.status === 0 ? "ERR" : entry.status}
              </span>
              <span className={`method-badge ${methodClass(entry.method)}`}>
                {entry.method}
              </span>
            </div>
            <div className="text-xs text-pulse-text-primary break-all font-mono">
              {entry.url}
            </div>
            <div className="flex gap-4 text-[11px] text-pulse-text-muted">
              <span>
                {entry.total_ms < 1000
                  ? `${entry.total_ms.toFixed(0)}ms`
                  : `${(entry.total_ms / 1000).toFixed(2)}s`}
              </span>
              <span>{entry.size_label}</span>
              <span>{formatTime(entry.timestamp)}</span>
            </div>
            {entry.error && (
              <div className="text-xs text-pulse-rose bg-pulse-rose/10 rounded px-2 py-1">
                {entry.error}
              </div>
            )}
          </div>

          {/* 请求头 */}
          <div className="border-b border-pulse-border/40">
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-[11px] font-medium text-pulse-text-secondary uppercase tracking-wider">
                Request Headers
              </span>
              {headersText && <CopyButton text={headersText} />}
            </div>
            <HeaderTable headers={entry.request_headers} />
          </div>

          {/* 请求体 */}
          {entry.request_body && (
            <div className="border-b border-pulse-border/40">
              <CopyBlock label="Request Body" text={entry.request_body} />
            </div>
          )}

          {/* 响应头 */}
          {Object.keys(entry.response_headers).length > 0 && (
            <div className="border-b border-pulse-border/40">
              <div className="flex items-center justify-between px-4 py-1.5">
                <span className="text-[11px] font-medium text-pulse-text-secondary uppercase tracking-wider">
                  Response Headers
                </span>
                {respHeadersText && <CopyButton text={respHeadersText} />}
              </div>
              <HeaderTable headers={entry.response_headers} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// 日志查看器主组件（在独立的 "logs" 窗口中运行）
// ============================================================

export default function LogViewer() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);  // 是否自动滚到底部

  const listRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const entryCountRef = useRef(0);

  // ── 初始化：加载历史日志 + 监听实时事件
  //
  // 策略：先启动事件监听（确保不丢失事件），再获取历史数据。
  // 使用 buffer 暂存在 fetch 完成前到达的事件，然后合并去重。
  useEffect(() => {
    let cancelled = false;
    const buffer: LogEntry[] = [];

    // 立即开始监听，防止在历史加载期间错过事件
    (async () => {
      const unlisten = await listen<LogEntry>("http-log", (event) => {
        buffer.push(event.payload);
        setEntries((prev) => {
          // 历史尚未加载——通过 buffer 暂存，跳过 state 更新
          if (prev.length === 0 && buffer.length > 0 && buffer.every((b) => b !== event.payload)) {
            return prev;
          }
          // 正常路径：按 ID 去重后追加
          if (prev.some((e) => e.id === event.payload.id)) return prev;
          const next = prev.concat(event.payload);
          return next.length > MAX_ENTRIES
            ? next.slice(next.length - MAX_ENTRIES)
            : next;
        });
      });

      if (cancelled) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    })();

    // 从 Rust 日志存储获取已有日志（数据权威来源）
    invoke<LogEntry[]>("get_logs")
      .then((history) => {
        if (cancelled) return;
        // 合并历史记录和 buffer 中的事件（按 ID 去重）
        const seen = new Set(history.map((e) => e.id));
        const extra = buffer.filter((e) => !seen.has(e.id));
        const merged = history.concat(extra);
        setEntries(merged);
        entryCountRef.current = merged.length;
      })
      .catch(() => {
        // Tauri IPC 失败——显示 buffer 内容；buffer 也为空则保持空列表
        if (!cancelled && buffer.length > 0) {
          setEntries(buffer);
          entryCountRef.current = buffer.length;
        }
      });

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  // ── 虚拟列表
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  // ── 自动滚动：新条目到达且用户未手动上滚时，滚到底部
  useEffect(() => {
    if (autoScroll && entries.length > entryCountRef.current) {
      virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    }
    entryCountRef.current = entries.length;
  }, [entries.length, autoScroll, virtualizer]);

  // ── 检测用户是否手动上滚（禁用 auto-scroll）
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const el = listRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  // ── 清空日志
  const clearLogs = useCallback(async () => {
    try {
      await invoke("clear_logs");
    } catch {
      // Rust 侧清除失败——前端仍然清除，让用户可重试
    }
    setEntries([]);
    setSelectedEntry(null);
  }, []);

  const handleEntryClick = useCallback((entry: LogEntry) => {
    setSelectedEntry((prev) => (prev?.id === entry.id ? null : entry));
  }, []);

  const handlePanelClose = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-pulse-deepest overflow-hidden select-text">
      {/* 头部 */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-pulse-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-pulse-text-primary tracking-wide">
            HTTP Logs
          </h1>
          <span className="text-xs text-pulse-text-muted">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <button onClick={clearLogs} className="btn-ghost text-xs">
          Clear
        </button>
      </header>

      {/* 日志列表（虚拟滚动） */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-pulse-text-muted font-sans text-sm">
            <div className="text-center space-y-1">
              <p>No HTTP requests recorded yet</p>
              <p className="text-xs">
                Send a request from the main window to see logs here
              </p>
            </div>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = entries[virtualItem.index];
              const isSelected = selectedEntry?.id === entry.id;

              return (
                <div
                  key={entry.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  onClick={() => handleEntryClick(entry)}
                  className={`absolute left-0 w-full border-b border-pulse-border/40 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-pulse-accent/10"
                      : "hover:bg-pulse-hover/30"
                  }`}
                  style={{
                    height: virtualItem.size,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="flex items-center gap-3 px-4 h-full">
                    <span className={`method-badge shrink-0 ${statusClass(entry.status)}`}>
                      {entry.status === 0 ? "ERR" : entry.status}
                    </span>
                    <span className={`method-badge shrink-0 ${methodClass(entry.method)}`}>
                      {entry.method}
                    </span>
                    <span
                      className={`truncate min-w-0 ${entry.error ? "text-pulse-rose" : "text-pulse-text-primary"}`}
                      title={entry.url}
                    >
                      {truncateUrl(entry.url)}
                    </span>
                    <span className="ml-auto shrink-0 text-pulse-text-muted flex items-center gap-3">
                      <span>
                        {entry.total_ms < 1000
                          ? `${entry.total_ms.toFixed(0)}ms`
                          : `${(entry.total_ms / 1000).toFixed(2)}s`}
                      </span>
                      <span>{entry.size_label}</span>
                      <span className="w-16 text-right">
                        {formatTime(entry.timestamp)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 详情面板 */}
      {selectedEntry && (
        <DetailPanel entry={selectedEntry} onClose={handlePanelClose} />
      )}
    </div>
  );
}
