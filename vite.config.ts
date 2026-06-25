import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 可选：Tauri 开发环境的主机地址（用于 HMR over WebSocket） */
const host = process.env.TAURI_DEV_HOST;

/**
 * Vite 构建配置
 *
 * - 端口 1420（严格模式——端口被占用则报错）
 * - 支持 Tauri 开发环境的 WebSocket HMR
 * - 忽略 src-tauri/ 目录的文件监听（避免不必要的重编译）
 */
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
