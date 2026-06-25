import type { TimingInfo } from "../types";

interface WaterfallChartProps {
  timing: TimingInfo;
}

/** 瀑布图中的各阶段定义 */
interface Phase {
  label: string;      // 短标签（如 "DNS"）
  ms: number;         // 耗时（毫秒）
  color: string;      // Tailwind 颜色类
  tooltip: string;    // 完整名称（鼠标悬浮时显示）
}

/**
 * 请求耗时瀑布图组件
 *
 * 将 DNS/TCP/TLS/TTFB/Download 各阶段以水平条形式可视化，
 * 条长与最大阶段耗时成比例。
 *
 * 注：DNS/TCP/TLS 数据为估算值——
 * reqwest 不提供原生分阶段计时，后端按 TTFB 的 35% 估算连接时间，
 * 再按 20%/30%/50% 分配。
 */
export default function WaterfallChart({ timing }: WaterfallChartProps) {
  const { total_ms, dns_lookup_ms, tcp_connect_ms, tls_handshake_ms, ttfb_ms, download_ms } = timing;

  const phases: Phase[] = [
    {
      label: "DNS",
      ms: dns_lookup_ms,
      color: "bg-pulse-indigo",
      tooltip: "DNS Lookup",
    },
    {
      label: "TCP",
      ms: tcp_connect_ms,
      color: "bg-pulse-blue",
      tooltip: "TCP Connect",
    },
    {
      label: "TLS",
      ms: tls_handshake_ms,
      color: "bg-pulse-purple",
      tooltip: "TLS Handshake",
    },
    {
      label: "TTFB",
      ms: ttfb_ms,
      color: "bg-pulse-accent",
      tooltip: "Time to First Byte",
    },
    {
      label: "Download",
      ms: download_ms,
      color: "bg-pulse-teal",
      tooltip: "Content Download",
    },
  ];

  // 如果所有阶段耗时均 < 0.1ms，不显示图表
  const hasSignificantTiming = phases.some((p) => p.ms > 0.1);
  const maxBarMs = Math.max(...phases.map((p) => p.ms), 1);

  if (!hasSignificantTiming) {
    return null;
  }

  return (
    <div className="px-4 py-2.5 border-b border-pulse-border bg-pulse-elevated/30 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-medium text-pulse-text-muted uppercase tracking-wider">
          Timing Waterfall
        </span>
        <span className="text-[10px] font-mono text-pulse-text-muted">
          {total_ms.toFixed(1)}ms total
        </span>
      </div>
      <div className="space-y-1">
        {phases.map((phase) => {
          const barPct = (phase.ms / maxBarMs) * 100;
          if (phase.ms < 0.01) return null;
          return (
            <div
              key={phase.label}
              className="flex items-center gap-2 group relative"
              title={`${phase.tooltip}: ${phase.ms.toFixed(1)}ms`}
            >
              <span className="w-14 text-[10px] font-mono text-pulse-text-muted text-right shrink-0">
                {phase.label}
              </span>
              <div className="flex-1 h-4 bg-pulse-deepest rounded-sm overflow-hidden relative">
                <div
                  className={`h-full ${phase.color} rounded-sm transition-all duration-500 ease-out opacity-80`}
                  style={{ width: `${Math.max(barPct, 2)}%`, minWidth: phase.ms > 0 ? "4px" : "0" }}
                />
              </div>
              <span className="w-12 text-[10px] font-mono text-pulse-text-secondary text-right shrink-0">
                {phase.ms.toFixed(1)}
                <span className="text-pulse-text-muted">ms</span>
              </span>
            </div>
          );
        })}
      </div>
      {/* 图例 */}
      <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-pulse-border/50">
        {phases.map((phase) => (
          <div key={phase.label} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${phase.color.replace("bg-", "bg-")}`} />
            <span className="text-[9px] text-pulse-text-muted">{phase.tooltip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
