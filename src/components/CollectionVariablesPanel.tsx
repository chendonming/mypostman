// ============================================================
// CollectionVariablesPanel — 集合级变量编辑器
//
// 嵌入在 Sidebar 的 Collection 配置区中，用于编辑集合级别的
// 默认变量。这些变量会在发送请求时作为 {{key}} 替换的默认值，
// 同名环境变量可覆盖之。
//
// 简化设计：无启用/禁用开关（集合变量始终启用）
// ============================================================

interface CollectionVariablesPanelProps {
  variables: Record<string, string>;
  onChange: (variables: Record<string, string>) => void;
}

export default function CollectionVariablesPanel({
  variables,
  onChange,
}: CollectionVariablesPanelProps) {
  const entries = Object.entries(variables);

  /** 添加一个空变量 */
  const handleAdd = () => {
    onChange({ ...variables, "": "" });
  };

  /** 修改变量的 key */
  const handleKeyChange = (oldKey: string, newKey: string) => {
    const updated: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      const targetKey = k === oldKey ? newKey : k;
      updated[targetKey] = v;
    }
    onChange(updated);
  };

  /** 修改变量的 value */
  const handleValueChange = (key: string, newValue: string) => {
    onChange({ ...variables, [key]: newValue });
  };

  /** 删除一个变量 */
  const handleRemove = (key: string) => {
    const updated: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      if (k !== key) {
        updated[k] = v;
      }
    }
    onChange(updated);
  };

  return (
    <div className="pl-5 pr-3 py-1.5 space-y-1 bg-pulse-deepest/30">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase text-pulse-text-muted tracking-wide">
          集合变量
        </span>
        <button
          onClick={handleAdd}
          className="text-[10px] text-pulse-accent hover:text-pulse-accent/80 transition-colors"
        >
          + 添加
        </button>
      </div>

      {/* 变量列表 */}
      {entries.length === 0 && (
        <p className="text-[10px] text-pulse-text-muted/60 italic">
          暂无集合变量 — 点击「+ 添加」创建
        </p>
      )}

      {entries.map(([key, value], index) => (
        <div key={index} className="flex items-center gap-1.5">
          {/* Key 输入 */}
          <input
            type="text"
            value={key}
            onChange={(e) => handleKeyChange(key, e.target.value)}
            placeholder="变量名"
            className="flex-[2] min-w-0 bg-pulse-deepest border border-pulse-border rounded px-1.5 py-1 text-[10px] font-mono text-pulse-text-primary outline-none placeholder:text-pulse-text-muted/40 focus:border-pulse-accent transition-colors"
          />
          {/* Value 输入 */}
          <input
            type="text"
            value={value}
            onChange={(e) => handleValueChange(key, e.target.value)}
            placeholder="值"
            className="flex-[3] min-w-0 bg-pulse-deepest border border-pulse-border rounded px-1.5 py-1 text-[10px] font-mono text-pulse-text-primary outline-none placeholder:text-pulse-text-muted/40 focus:border-pulse-accent transition-colors"
          />
          {/* 删除按钮 */}
          <button
            onClick={() => handleRemove(key)}
            className="shrink-0 p-1 text-pulse-text-muted hover:text-red-400 transition-colors"
            title="删除变量"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
