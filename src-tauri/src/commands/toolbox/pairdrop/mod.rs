// 跨设备传输模块
//
// 思路：在 0.0.0.0 上跑一个 axum HTTP 服务，浏览器扫码访问后通过 WebSocket
// 建立信令通道，再用 HTTP 中继做文件传输。桌面端自身也是一个 WebSocket 客户端，
// 与浏览器对等。MVP 不接 WebRTC，纯服务器中继即可满足局域网速度。
//
// 子模块：
// - assets   静态资源（浏览器侧的 HTML/JS/CSS）
// - commands Tauri 命令
// - runtime  axum 服务运行时
// - state    全局状态（peer 列表、文件中继缓存）

pub mod assets;
pub mod commands;
pub mod runtime;
pub mod state;

pub use commands::*;
