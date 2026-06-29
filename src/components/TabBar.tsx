import type { TabState } from "../types";

// ============================================================
// TabBar 标签栏组件
//
// 显示所有已打开的标签页，支持切换、关闭和新建。
// 激活标签页顶部有琥珀色脉冲光晕动画（呼应产品名 "Pulse"）。
//
// 布局：
// ┌───────────────────────────────────────────────────────────┐
// │ [GET] /api/users  ×     [POST]/login  ×     [+]         │
// │ ════════════════ (active indicator — pulse-glow)         │
// └───────────────────────────────────────────────────────────┘
// ============================================================

interface TabBarProps {
  tabs: TabState[];
  activeTabId: string;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

/** HTTP 方法对应的文本颜色 class */
const methodStyles: Record<string, string> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  PATCH: "text-method-patch",
  DELETE: "text-method-delete",
  HEAD: "text-method-head",
  OPTIONS: "text-method-get",
};

/**
 * 计算标签页标题（展示用）
 * - 已保存的命名请求 → 使用 title
 * - 有 URL 的空白标签页 → 使用 URL 最后一段路径
 * - 空白标签页 → "New Request"
 */
function getTabTitle(tab: TabState): string {
  if (tab.editingRequest) return tab.title; // 来自集合的命名请求
  if (tab.url) {
    try {
      const segments = tab.url.split("/").filter(Boolean);
      const last = segments.pop();
      if (last && !last.includes(".")) return last;
      if (last) return last.split("?")[0] ?? last;
    } catch {
      // fall through
    }
  }
  return tab.title; // "New Request"
}

/**
 * TabBar 标签栏
 *
 * 固定在请求面板上方，始终占据整行宽度。
 * 标签页超出时水平滚动，"+"按钮始终可见。
 */
export default function TabBar({
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onNewTab,
}: TabBarProps) {
  return (
    <div className="flex items-center shrink-0 bg-pulse-surface border-b border-pulse-border h-9 min-h-9">
      {/* 标签页滚动容器 */}
      <div className="flex-1 flex items-center overflow-x-auto overflow-y-hidden scrollbar-none">
        <div className="flex items-stretch h-full">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                onClick={() => onSwitchTab(tab.id)}
                className={`
                  group relative flex items-center gap-1.5 px-2.5 text-xs
                  border-r border-pulse-border
                  transition-colors duration-150
                  whitespace-nowrap shrink-0
                  ${
                    isActive
                      ? "bg-pulse-elevated text-pulse-text-primary border-t-2 border-pulse-accent tab-pulse-glow"
                      : "bg-pulse-surface text-pulse-text-muted hover:text-pulse-text-secondary hover:bg-pulse-hover border-t-2 border-transparent"
                  }
                `}
                title={tab.url || tab.title}
              >
                {/* HTTP 方法标徽 */}
                <span
                  className={`font-mono font-semibold text-[10px] uppercase tracking-wide ${
                    methodStyles[tab.method] || "text-pulse-text-muted"
                  }`}
                >
                  {tab.method}
                </span>

                {/* 标签页标题 */}
                <span className="font-mono text-[11px] max-w-[120px] truncate">
                  {getTabTitle(tab)}
                </span>

                {/* 脏状态指示点 */}
                {tab.savedSnapshot && (
                  <>
                    {(() => {
                      // 简单脏状态比较（与 usePulse 中的逻辑一致）
                      const s = tab.savedSnapshot;
                      const dirty =
                        tab.method !== s.method ||
                        tab.url.trim() !== s.url ||
                        JSON.stringify(tab.headers) !== JSON.stringify(s.headers) ||
                        tab.body !== s.body ||
                        JSON.stringify(tab.bodyParams) !== JSON.stringify(s.bodyParams) ||
                        tab.contentType !== s.contentType ||
                        tab.authType !== s.authType ||
                        tab.bearerToken !== s.bearerToken ||
                        JSON.stringify(tab.rawParams) !== JSON.stringify(s.rawParams);
                      return dirty ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-pulse-accent animate-pulse-soft" />
                      ) : null;
                    })()}
                  </>
                )}

                {/* 关闭按钮（悬停或激活时显示） */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className={`
                    flex items-center justify-center w-4 h-4 rounded
                    text-pulse-text-muted/40 hover:text-pulse-rose hover:bg-pulse-hover
                    transition-all duration-100
                    ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
                  `}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>

                {/* 激活标签页底部指示线 */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[1px] bg-pulse-accent/60" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 新建标签页按钮 */}
      <button
        onClick={onNewTab}
        className="shrink-0 flex items-center justify-center w-8 h-full text-pulse-text-muted hover:text-pulse-accent hover:bg-pulse-hover transition-colors active:scale-95"
        title="New Tab"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
