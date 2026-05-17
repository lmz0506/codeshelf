//! OpenPath / OpenInEditor / OpenTerminal / OpenUrl —— 桥接到 commands::system 的跨平台实现。

use crate::error::AppResult;
use serde_json::Value;

use super::ctx::expand_home;

pub(super) async fn tool_open_path(args: &Value) -> AppResult<String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let path = expand_home(path);
    crate::commands::system::open_in_explorer(path.clone()).await?;
    Ok(format!("已在文件管理器中打开：{}", path))
}

pub(super) async fn tool_open_in_editor(args: &Value) -> AppResult<String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let path = expand_home(path);
    let editor = args
        .get("editor")
        .and_then(|v| v.as_str())
        .map(expand_home);
    if let Some(e) = &editor {
        if e.contains("&&") || e.contains("||") || e.contains(';') || e.contains('|') || e.contains('`') {
            return Err("editor 参数包含危险字符".into());
        }
    }
    crate::commands::system::open_in_editor(path.clone(), editor.clone()).await?;
    Ok(format!(
        "已在编辑器打开：{}（{}）",
        path,
        editor.as_deref().unwrap_or("默认 VS Code")
    ))
}

pub(super) async fn tool_open_terminal(args: &Value) -> AppResult<String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let path = expand_home(path);
    let terminal = args
        .get("terminal")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    crate::commands::system::open_in_terminal(path.clone(), terminal, None, None).await?;
    Ok(format!("已在终端打开：{}", path))
}

pub(super) async fn tool_open_url(args: &Value) -> AppResult<String> {
    let url = args
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("缺少 url")?
        .to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("仅支持 http/https URL".into());
    }
    crate::commands::system::open_url(url.clone()).await?;
    Ok(format!("已在浏览器打开：{}", url))
}
