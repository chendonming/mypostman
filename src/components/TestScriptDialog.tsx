// ============================================================
// TestScriptDialog 组件
//
// 用于选择 YAML 测试脚本文件、执行并展示运行结果。
// 两种状态：文件选择阶段 → 结果展示阶段
// ============================================================

import { useState } from "react";
import type { TestRunResult, TestStepResult as TStepResult } from "../types";

interface TestScriptDialogProps {
  visible: boolean;
  /** 已选文件名（不含路径） */
  fileName: string;
  /** 是否已选择文件 */
  hasPending: boolean;
  /** 测试是否正在运行中 */
  isRunning: boolean;
  /** 测试运行结果（完成后） */
  result: TestRunResult | null;
  /** 错误信息 */
  error: string | null;
  /** 选择测试脚本文件 */
  onPickFile: () => void;
  /** 执行测试 */
  onRun: () => void;
  /** 关闭对话框 */
  onCancel: () => void;
}

/** 将毫秒数格式化为人类可读字符串 */
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 获取状态码对应的颜色 class */
function statusColor(status: number): string {
  if (status === 0) return "text-pulse-text-muted";
  if (status < 300) return "text-pulse-emerald";
  if (status < 500) return "text-pulse-amber";
  return "text-pulse-rose";
}

export default function TestScriptDialog({
  visible,
  fileName,
  hasPending,
  isRunning,
  result,
  error,
  onPickFile,
  onRun,
  onCancel,
}: TestScriptDialogProps) {
  if (!visible) return null;

  // 点击浮层背景关闭
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={handleBackdrop}
    >
      <div className="w-[520px] max-h-[80vh] bg-pulse-surface border border-pulse-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-pulse-border shrink-0">
          <h2 className="text-sm font-semibold text-pulse-text-primary">
            Run Test Script
          </h2>
          <button onClick={onCancel} className="btn-ghost text-xs px-2 py-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 文件选择区 */}
          <div className="flex items-center gap-3">
            <button
              onClick={onPickFile}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-pulse-deepest border border-pulse-border text-pulse-text-primary hover:bg-pulse-hover transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Select File (.yaml)
            </button>
            {fileName && (
              <span className="text-xs text-pulse-text-secondary truncate max-w-[280px]">
                {fileName}
              </span>
            )}
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="bg-pulse-rose/10 border border-pulse-rose/30 rounded-lg px-4 py-3 text-xs text-pulse-rose">
              {error}
            </div>
          )}

          {/* 无文件提示 */}
          {!hasPending && !result && !error && (
            <div className="text-center py-8 text-xs text-pulse-text-muted">
              <p>Select a YAML test script file to run</p>
              <p className="mt-1">Test scripts define requests and assertions to validate your API</p>
            </div>
          )}

          {/* 已选择文件，尚未运行 */}
          {hasPending && !result && !isRunning && !error && (
            <div className="bg-pulse-deepest/50 rounded-lg px-4 py-3 space-y-1 text-xs text-pulse-text-secondary">
              <p>File: <span className="text-pulse-text-primary font-medium">{fileName}</span></p>
              <p>Click "Run Tests" to execute all requests in the script</p>
            </div>
          )}

          {/* 运行中状态 */}
          {isRunning && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-pulse-accent animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-pulse-text-secondary">Running tests…</span>
              </div>
            </div>
          )}

          {/* 测试结果 */}
          {result && !isRunning && (
            <div className="space-y-3">
              {/* 汇总摘要 */}
              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  result.failed_steps === 0
                    ? "bg-pulse-emerald/10 border border-pulse-emerald/30 text-pulse-emerald"
                    : "bg-pulse-rose/10 border border-pulse-rose/30 text-pulse-rose"
                }`}
              >
                <div className="font-semibold">
                  {result.passed_steps}/{result.total_steps} passed
                </div>
                {result.error && (
                  <div className="mt-1 text-xs opacity-80">{result.error}</div>
                )}
              </div>

              {/* 每步结果 */}
              <div className="space-y-1">
                {result.steps.map((step, idx) => (
                  <TestStepRow key={idx} step={step} />
                ))}
              </div>

              {/* 空白结果提示 */}
              {result.total_steps === 0 && !result.error && (
                <div className="text-center py-6 text-xs text-pulse-text-muted">
                  No requests to execute
                </div>
              )}
            </div>
          )}
        </div>

        {/* 操作按钮栏 */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-pulse-border shrink-0">
          <button onClick={onCancel} className="btn-ghost text-xs px-4 py-1.5">
            Close
          </button>
          {hasPending && !isRunning && (
            <button
              onClick={onRun}
              disabled={isRunning}
              className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Tests
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 单步结果行（可展开查看断言详情）
// ============================================================

function TestStepRow({ step }: { step: TStepResult }) {
  const [expanded, setExpanded] = useState(false);

  const hasAssertions = step.assertion_results.length > 0;

  return (
    <div className="border border-pulse-border rounded-lg overflow-hidden">
      {/* 步骤标题行 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-pulse-hover transition-colors"
      >
        {/* 通过/失败图标 */}
        {step.error ? (
          <span className="w-4 h-4 flex items-center justify-center text-pulse-rose shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </span>
        ) : step.passed ? (
          <span className="w-4 h-4 flex items-center justify-center text-pulse-emerald shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        ) : (
          <span className="w-4 h-4 flex items-center justify-center text-pulse-rose shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        )}

        {/* 请求名称 */}
        <span className="flex-1 text-xs text-pulse-text-primary truncate">{step.name}</span>

        {/* HTTP 方法 */}
        <span className="font-mono font-semibold text-[10px] uppercase text-pulse-text-muted shrink-0">
          {step.method}
        </span>

        {/* 状态码 */}
        <span className={`font-mono text-[11px] font-medium ${statusColor(step.status)} shrink-0`}>
          {step.error ? "ERR" : step.status}
        </span>

        {/* 耗时 */}
        <span className="text-[10px] text-pulse-text-muted tabular-nums shrink-0 w-14 text-right">
          {fmtDuration(step.duration_ms)}
        </span>

        {/* 展开箭头 */}
        {hasAssertions && (
          <svg
            className={`w-3 h-3 text-pulse-text-muted transition-transform shrink-0 ${
              expanded ? "rotate-90" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}

        {/* 错误标识 */}
        {step.error && (
          <span className="text-[10px] text-pulse-rose/60">error</span>
        )}
      </button>

      {/* 展开的断言详情 */}
      {expanded && hasAssertions && (
        <div className="border-t border-pulse-border px-3 py-2 space-y-1 bg-pulse-deepest/30">
          {step.assertion_results.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span
                className={`shrink-0 mt-0.5 ${
                  a.passed ? "text-pulse-emerald" : "text-pulse-rose"
                }`}
              >
                {a.passed ? "✓" : "✗"}
              </span>
              <div className="flex-1 min-w-0">
                <code className="text-pulse-text-primary">{a.expression}</code>
                {!a.passed && (
                  <div className="text-pulse-text-muted mt-0.5">
                    {a.error ? (
                      <span className="text-pulse-rose/80">{a.error}</span>
                    ) : (
                      <span>
                        Expected{" "}
                        <code className="text-pulse-accent">{a.expected_value ?? "null"}</code>
                        , got{" "}
                        <code className="text-pulse-rose/80">{a.actual_value ?? "null"}</code>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {step.error && (
            <div className="flex items-start gap-2 text-[11px]">
              <span className="shrink-0 mt-0.5 text-pulse-rose">✗</span>
              <span className="text-pulse-rose/80">{step.error}</span>
            </div>
          )}
        </div>
      )}

      {/* 展开的错误详情（无断言但有错误） */}
      {expanded && step.error && !hasAssertions && (
        <div className="border-t border-pulse-border px-3 py-2 bg-pulse-deepest/30">
          <div className="flex items-start gap-2 text-[11px]">
            <span className="shrink-0 mt-0.5 text-pulse-rose">✗</span>
            <span className="text-pulse-rose/80">{step.error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
