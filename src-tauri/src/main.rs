// 防止 Windows 发布版出现额外控制台窗口（仅 GUI 模式有效）
// CLI 模式在 debug 构建下自动有控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/**
 * 程序入口
 *
 * 双模式入口：
 * - 不带参数或仅带 --logs → 启动 Tauri GUI 应用（委托给 pulse_lib::run()）
 *   --logs 表示启动时同时打开日志查看器窗口
 * - 其他参数 → 进入 CLI 命令行模式（委托给 pulse_lib::cli_run()）
 *   CLI 支持 request/test/collections/environments/export/import 子命令
 */
fn main() {
    // 检查是否有 CLI 命令参数（排除 --logs 标志）
    let has_cli_command = std::env::args().skip(1).any(|a| a != "--logs");

    if has_cli_command {
        pulse_lib::cli_run();
    } else {
        // --logs 标志由 pulse_lib::run() 内部处理
        pulse_lib::run()
    }
}
