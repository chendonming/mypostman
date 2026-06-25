import type { AuthType } from "../types";

interface AuthPanelProps {
  authType: AuthType;
  onAuthTypeChange: (t: AuthType) => void;
  bearerToken: string;
  onBearerTokenChange: (t: string) => void;
  /** 当前请求所属集合名称（用于显示继承来源） */
  editingCollectionName: string | null;
}

/** 认证方式选项列表 */
const AUTH_OPTIONS: { value: AuthType; label: string }[] = [
  { value: "none", label: "No Auth" },
  { value: "inherit", label: "Inherit from collection" },
  { value: "bearer", label: "Bearer Token" },
];

/**
 * 认证配置面板
 *
 * 支持三种模式：
 * - No Auth：无认证
 * - Inherit from collection：继承所属集合的认证配置
 * - Bearer Token：手动输入 Bearer Token（会自动添加 "Bearer " 前缀）
 */
export default function AuthPanel({
  authType,
  onAuthTypeChange,
  bearerToken,
  onBearerTokenChange,
  editingCollectionName,
}: AuthPanelProps) {
  return (
    <div className="p-3 space-y-3">
      {/* 认证类型选择器 */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-pulse-text-secondary w-16">
          Type
        </label>
        <select
          value={authType}
          onChange={(e) => onAuthTypeChange(e.target.value as AuthType)}
          className="bg-pulse-deepest border border-pulse-border rounded px-2 py-1.5 text-xs font-mono text-pulse-text-primary cursor-pointer transition-colors"
        >
          {AUTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 继承说明：显示从哪个集合继承 */}
      {authType === "inherit" && (
        <div className="pl-[5.5rem]">
          {editingCollectionName ? (
            <p className="text-[11px] text-pulse-text-muted">
              Using auth from{" "}
              <span className="text-pulse-accent font-medium">
                {editingCollectionName}
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-pulse-amber">
              This request is not saved in a collection. Inherit will fall back to No Auth.
            </p>
          )}
        </div>
      )}

      {/* Bearer Token 输入 */}
      {authType === "bearer" && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-pulse-text-secondary w-16">
              Token
            </label>
            <input
              type="text"
              value={bearerToken}
              onChange={(e) => onBearerTokenChange(e.target.value)}
              placeholder="Enter your bearer token..."
              className="flex-1 bg-pulse-deepest border border-pulse-border rounded px-2 py-1.5 text-xs font-mono text-pulse-text-primary placeholder-pulse-text-muted/50 transition-colors"
            />
          </div>
          {bearerToken.trim() && (
            <p className="text-[11px] text-pulse-text-muted pl-[5.5rem]">
              Will be sent as:{" "}
              <code className="text-pulse-accent">
                Authorization: Bearer{" "}
                {bearerToken.trim().replace(/^Bearer\s+/i, "")}
              </code>
            </p>
          )}
        </>
      )}
    </div>
  );
}
