//! 工具会话上下文：路径校验、~ 展开、输出截断。

use std::fs;
use std::path::{Path, PathBuf};

use crate::storage::ChatSession;

pub(super) fn session_path_json(session_id: &str) -> Result<PathBuf, String> {
    let dir = crate::commands::chat::resolve_chat_history_dir_pub()?;
    Ok(dir.join(format!("{}.json", session_id)))
}

pub(super) fn session_tasks_path(session_id: &str) -> Result<PathBuf, String> {
    let dir = crate::commands::chat::resolve_chat_history_dir_pub()?;
    Ok(dir.join(format!("{}.tasks.json", session_id)))
}

fn load_session(session_id: &str) -> Result<ChatSession, String> {
    let path = session_path_json(session_id)?;
    let text = fs::read_to_string(&path).map_err(|e| format!("读取会话失败: {}", e))?;
    serde_json::from_str(&text).map_err(|e| format!("解析会话失败: {}", e))
}

/// 当前工具上下文
pub(super) struct ToolCtx {
    pub session_id: String,
    pub allowed_cwd: Option<PathBuf>,
}

pub(super) fn load_ctx(session_id: &str) -> Result<ToolCtx, String> {
    let session = load_session(session_id)?;
    Ok(ToolCtx {
        session_id: session_id.to_string(),
        allowed_cwd: session.allowed_cwd.as_ref().map(PathBuf::from),
    })
}

/// 校验某路径是否在 allowed_cwd 内（canonicalize 后比较）
pub(super) fn require_under_cwd(ctx: &ToolCtx, target: &Path) -> Result<PathBuf, String> {
    let base = ctx
        .allowed_cwd
        .as_ref()
        .ok_or_else(|| "会话未设置 allowedCwd，禁止写/执行类工具".to_string())?;
    let base_canon = fs::canonicalize(base).map_err(|e| format!("allowedCwd 无效: {}", e))?;

    // 允许目标文件不存在（Write 新建）；对其父目录做校验
    let candidate = if target.is_absolute() {
        target.to_path_buf()
    } else {
        base_canon.join(target)
    };
    let check = if candidate.exists() {
        fs::canonicalize(&candidate).map_err(|e| format!("目标路径无效: {}", e))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| "目标路径无父目录".to_string())?;
        let parent_canon =
            fs::canonicalize(parent).map_err(|e| format!("目标父目录无效: {}", e))?;
        parent_canon.join(candidate.file_name().unwrap_or_default())
    };
    if !check.starts_with(&base_canon) {
        return Err(format!(
            "路径越界：{} 不在 allowedCwd {} 下",
            check.display(),
            base_canon.display()
        ));
    }
    Ok(check)
}

pub(super) fn truncate(s: String, max: usize) -> String {
    if s.len() <= max {
        s
    } else {
        format!("{}\n… [已截断，共 {} 字节]", &s[..max], s.len())
    }
}

/// 展开路径开头的 `~` / `~/` 为 $HOME（Windows 下为 %USERPROFILE%）。
/// 其它情况原样返回。
pub(super) fn expand_home(input: &str) -> String {
    let home = if cfg!(windows) {
        std::env::var("USERPROFILE").ok()
    } else {
        std::env::var("HOME").ok()
    };
    let Some(home) = home else {
        return input.to_string();
    };
    if input == "~" {
        return home;
    }
    if let Some(rest) = input.strip_prefix("~/") {
        return format!("{}/{}", home.trim_end_matches('/'), rest);
    }
    #[cfg(windows)]
    {
        if let Some(rest) = input.strip_prefix("~\\") {
            return format!("{}\\{}", home.trim_end_matches('\\'), rest);
        }
    }
    input.to_string()
}
