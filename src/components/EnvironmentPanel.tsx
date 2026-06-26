import { useState } from "react";
import type { Environment, EnvironmentVariable } from "../types";

interface EnvironmentPanelProps {
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

/**
 * 环境变量管理面板（内嵌在侧边栏的 Envs Tab 中）
 *
 * 功能：
 * - 列出所有环境，支持点击切换激活状态
 * - 选中环境后显示/编辑其变量（Key/Value 键值对）
 * - 变量支持启用/禁用，禁用的变量在 {{key}} 替换时会被跳过
 * - 环境可重命名、删除
 */
export default function EnvironmentPanel({
  environments,
  activeEnvironmentId,
  onAddEnvironment,
  onDeleteEnvironment,
  onRenameEnvironment,
  onSetActiveEnvironment,
  onAddVariable,
  onUpdateVariable,
  onRemoveVariable,
}: EnvironmentPanelProps) {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameBuffer, setNameBuffer] = useState("");

  // 开始重命名环境（填充初始值到输入框）
  const handleStartRename = (env: Environment) => {
    setEditingName(env.id);
    setNameBuffer(env.name);
  };

  // 完成重命名（校验并保存）
  const handleFinishRename = () => {
    if (editingName && nameBuffer.trim()) {
      onRenameEnvironment(editingName, nameBuffer.trim());
    }
    setEditingName(null);
    setNameBuffer("");
  };

  // 重命名输入框的键盘事件（Enter 确认，Escape 取消）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleFinishRename();
    if (e.key === "Escape") setEditingName(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部：标题 + 添加按钮 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-pulse-border">
        <span className="text-[11px] font-semibold text-pulse-text-muted uppercase tracking-wider">
          Environments
        </span>
        <button
          onClick={onAddEnvironment}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-pulse-hover text-pulse-text-muted hover:text-pulse-text-primary transition-colors"
          title="Add environment"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {environments.length === 0 ? (
        /* 空状态提示 */
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center">
          <p className="text-xs text-pulse-text-muted">No environments yet</p>
          <button
            onClick={onAddEnvironment}
            className="mt-2 text-xs text-pulse-accent hover:underline"
          >
            Create your first environment
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-pulse-border">
            {environments.map((env) => (
              <div key={env.id}>
                {/* 环境行（单选 + 名称 + 操作按钮） */}
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors group ${
                    selectedEnvId === env.id
                      ? "bg-pulse-hover"
                      : "hover:bg-pulse-hover"
                  }`}
                >
                  {/* 激活/停用单选按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetActiveEnvironment(
                        activeEnvironmentId === env.id ? null : env.id,
                      );
                    }}
                    className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      activeEnvironmentId === env.id
                        ? "border-pulse-accent"
                        : "border-pulse-text-muted hover:border-pulse-text-secondary"
                    }`}
                    title={
                      activeEnvironmentId === env.id
                        ? "Deactivate environment"
                        : "Activate environment"
                    }
                  >
                    {activeEnvironmentId === env.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-pulse-accent" />
                    )}
                  </button>

                  {/* 环境名称（单击展开/折叠变量编辑器） */}
                  <button
                    onClick={() => setSelectedEnvId(env.id)}
                    className="flex-1 text-left"
                  >
                    {editingName === env.id ? (
                      <input
                        autoFocus
                        value={nameBuffer}
                        onChange={(e) => setNameBuffer(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-pulse-deepest border border-pulse-border rounded px-1 py-0.5 text-xs text-pulse-text-primary outline-none focus:border-pulse-accent"
                      />
                    ) : (
                      <span className="text-pulse-text-primary">{env.name}</span>
                    )}
                  </button>

                  {/* 重命名按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(env);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-pulse-text-muted hover:text-pulse-text-primary transition-all"
                    title="Rename"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedEnvId === env.id) setSelectedEnvId(null);
                      onDeleteEnvironment(env.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-pulse-text-muted hover:text-pulse-rose transition-all"
                    title="Delete"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2 4h12M5 4V2h6v2M4 4v10h8V4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                {/* 变量编辑器（选中环境时展开） */}
                {selectedEnvId === env.id && (
                  <div className="px-3 pb-2">
                    <div className="flex items-center justify-between mt-1.5 mb-1">
                      <span className="text-[10px] font-semibold text-pulse-text-muted uppercase tracking-wider">
                        Variables
                      </span>
                      <button
                        onClick={() => onAddVariable(env.id)}
                        className="text-[10px] text-pulse-accent hover:underline"
                      >
                        + Add
                      </button>
                    </div>

                    {env.variables.length === 0 ? (
                      <p className="text-[10px] text-pulse-text-muted italic">
                        No variables. Add one to use <code className="text-pulse-accent not-italic">{`{{key}}`}</code> in your requests.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {env.variables.map((v, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1"
                          >
                            {/* 启用/禁用复选框 */}
                            <button
                              onClick={() =>
                                onUpdateVariable(env.id, i, "enabled", !v.enabled)
                              }
                              className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
                                v.enabled
                                  ? "bg-pulse-accent border-pulse-accent"
                                  : "border-pulse-text-muted"
                              }`}
                            >
                              {v.enabled && (
                                <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                                  <path
                                    d="M2 6l3 3 5-5"
                                    stroke="#0B0D15"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </button>

                            {/* 变量名输入（KEY） */}
                            <input
                              value={v.key}
                              onChange={(e) =>
                                onUpdateVariable(env.id, i, "key", e.target.value)
                              }
                              placeholder="KEY"
                              className={`flex-1 min-w-0 bg-pulse-deepest border border-pulse-border rounded px-1 py-0.5 text-[10px] font-mono text-pulse-text-primary outline-none placeholder:text-pulse-text-muted focus:border-pulse-accent ${
                                !v.enabled ? "opacity-50" : ""
                              }`}
                            />

                            {/* 变量值输入 */}
                            <input
                              value={v.value}
                              onChange={(e) =>
                                onUpdateVariable(env.id, i, "value", e.target.value)
                              }
                              placeholder="value"
                              className={`flex-[2] min-w-0 bg-pulse-deepest border border-pulse-border rounded px-1 py-0.5 text-[10px] font-mono text-pulse-text-primary outline-none placeholder:text-pulse-text-muted focus:border-pulse-accent ${
                                !v.enabled ? "opacity-50" : ""
                              }`}
                            />

                            {/* 删除变量按钮 */}
                            <button
                              onClick={() => onRemoveVariable(env.id, i)}
                              className="w-4 h-4 flex items-center justify-center text-pulse-text-muted hover:text-pulse-rose shrink-0 transition-colors"
                            >
                              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                                <path
                                  d="M2 2l8 8M10 2l-8 8"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
