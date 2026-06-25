import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LogViewer from "./LogViewer";
import "./index.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 应用入口组件
 *
 * 根据窗口标签（label）决定渲染内容：
 * - "logs" 窗口 → 日志查看器（LogViewer）
 * - "main" 窗口 → 主应用（App）
 *
 * Tauri 在 setup 阶段创建了两个窗口：
 * main（1400×900）和 logs（900×550）
 */
function Main() {
  const label = getCurrentWindow().label;

  if (label === "logs") {
    return <LogViewer />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Main />
  </React.StrictMode>,
);
