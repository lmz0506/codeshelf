// 浏览器端静态资源：HTML / CSS / JS 全部内联在一个文件里方便分发。
//
// 单文件 SPA：连接 /ws 拿 peer 列表，HTTP POST /api/upload 上传文件，
// 收到通知后再 GET /api/file/:token 下载。

pub const INDEX_HTML: &str = include_str!("./assets/index.html");
