// 防止 Windows 发布版出现额外控制台窗口，请勿删除！！
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/** 程序入口：委托给 pulse_lib crate 的 run() 函数 */
fn main() {
    pulse_lib::run()
}
