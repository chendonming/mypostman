import type {
  Collection,
  HistoryItem,
  SidebarTab,
  Environment,
  EnvironmentVariable,
} from "../types";
import EnvironmentPanel from "./EnvironmentPanel";

interface SidebarProps {
  collections: Collection[];
  history: HistoryItem[];
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onLoadHistory: (item: HistoryItem) => void;
  onLoadRequest: (item: { method: string; url: string }) => void;
  /* ── Environment props ── */
  environments: Environment[];
  activeEnvironmentId: string | null;
  onAddEnvironment: () => void;
  onDeleteEnvironment: (id: string) => void;
  onRenameEnvironment: (id: string, name: string) => void;
  onSetActiveEnvironment: (id: string | null) => void;
  onAddVariable: (envId: string) => void;
  onUpdateVariable: (
    envId: string,
    index: number,
    field: keyof EnvironmentVariable,
    value: string | boolean,
  ) => void;
  onRemoveVariable: (envId: string, index: number) => void;
}

const methodStyles: Record<string, string> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  PATCH: "text-method-patch",
  DELETE: "text-method-delete",
  HEAD: "text-method-head",
  OPTIONS: "text-method-get",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export default function Sidebar({
  collections,
  history,
  activeTab,
  onTabChange,
  onLoadHistory,
  onLoadRequest,
  environments,
  activeEnvironmentId,
  onAddEnvironment,
  onDeleteEnvironment,
  onRenameEnvironment,
  onSetActiveEnvironment,
  onAddVariable,
  onUpdateVariable,
  onRemoveVariable,
}: SidebarProps) {
  return (
    <aside className="w-60 flex flex-col border-r border-pulse-border bg-pulse-surface shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-pulse-border">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pulse-indigo to-pulse-accent flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 128 128" fill="none">
            <path
              d="M40 44 L60 64 L40 84"
              stroke="#0B0D15"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M60 64 L88 64"
              stroke="#0B0D15"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold text-pulse-text-primary tracking-tight">
          Pulse
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-pulse-border">
        <button
          onClick={() => onTabChange("collections")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === "collections"
              ? "text-pulse-accent border-b-2 border-pulse-accent"
              : "text-pulse-text-muted hover:text-pulse-text-secondary"
          }`}
        >
          Collections
        </button>
        <button
          onClick={() => onTabChange("history")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === "history"
              ? "text-pulse-accent border-b-2 border-pulse-accent"
              : "text-pulse-text-muted hover:text-pulse-text-secondary"
          }`}
        >
          History
        </button>
        <button
          onClick={() => onTabChange("environments")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === "environments"
              ? "text-pulse-accent border-b-2 border-pulse-accent"
              : "text-pulse-text-muted hover:text-pulse-text-secondary"
          }`}
        >
          Envs
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "collections" ? (
          <div className="py-2">
            {collections.map((col) => (
              <div key={col.id}>
                <div className="px-3 py-1.5 text-[11px] font-semibold text-pulse-text-muted uppercase tracking-wider">
                  {col.name}
                </div>
                {col.requests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => onLoadRequest(req)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-pulse-hover transition-colors text-left group"
                  >
                    <span
                      className={`font-mono font-semibold text-[10px] uppercase tracking-wide ${
                        methodStyles[req.method] || "text-pulse-text-muted"
                      }`}
                    >
                      {req.method}
                    </span>
                    <span className="text-pulse-text-secondary truncate group-hover:text-pulse-text-primary transition-colors">
                      {req.name}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : activeTab === "history" ? (
          <div className="py-2">
            {history.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-pulse-text-muted">
                <p>No requests yet</p>
                <p className="mt-1">Send a request to see it here</p>
              </div>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onLoadHistory(item)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-pulse-hover transition-colors text-left group"
                >
                  <span
                    className={`font-mono font-semibold text-[10px] uppercase tracking-wide shrink-0 ${
                      methodStyles[item.method] || "text-pulse-text-muted"
                    }`}
                  >
                    {item.method}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-pulse-text-secondary group-hover:text-pulse-text-primary transition-colors">
                      {item.url}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.status && (
                        <span
                          className={`text-[10px] font-medium ${
                            item.status < 300
                              ? "text-pulse-emerald"
                              : item.status < 500
                                ? "text-pulse-amber"
                                : "text-pulse-rose"
                          }`}
                        >
                          {item.status}
                        </span>
                      )}
                      <span className="text-[10px] text-pulse-text-muted">
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <EnvironmentPanel
            environments={environments}
            activeEnvironmentId={activeEnvironmentId}
            onAddEnvironment={onAddEnvironment}
            onDeleteEnvironment={onDeleteEnvironment}
            onRenameEnvironment={onRenameEnvironment}
            onSetActiveEnvironment={onSetActiveEnvironment}
            onAddVariable={onAddVariable}
            onUpdateVariable={onUpdateVariable}
            onRemoveVariable={onRemoveVariable}
          />
        )}
      </div>
    </aside>
  );
}
