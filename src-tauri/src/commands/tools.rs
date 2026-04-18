//! Chat agentic 工具集
//!
//! 提供 Read/Write/Edit/Glob/Grep/Bash 文件系统 & shell 工具，
//! 以及会话级 TaskCreate/TaskUpdate/TaskList 任务工具。
//!
//! 工具执行不负责授权——授权由前端弹窗决定；后端只做 sandbox 级路径校验。

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::RwLock;
use tokio::time::timeout as tokio_timeout;

use crate::storage::{current_iso_time, generate_id, ChatSession};

// ========== 会话上下文 ==========

fn session_path_json(session_id: &str) -> Result<PathBuf, String> {
    let dir = super::chat::resolve_chat_history_dir_pub()?;
    Ok(dir.join(format!("{}.json", session_id)))
}

fn session_tasks_path(session_id: &str) -> Result<PathBuf, String> {
    let dir = super::chat::resolve_chat_history_dir_pub()?;
    Ok(dir.join(format!("{}.tasks.json", session_id)))
}

fn load_session(session_id: &str) -> Result<ChatSession, String> {
    let path = session_path_json(session_id)?;
    let text = fs::read_to_string(&path)
        .map_err(|e| format!("读取会话失败: {}", e))?;
    serde_json::from_str(&text).map_err(|e| format!("解析会话失败: {}", e))
}

/// 当前工具上下文
struct ToolCtx {
    session_id: String,
    allowed_cwd: Option<PathBuf>,
}

fn load_ctx(session_id: &str) -> Result<ToolCtx, String> {
    let session = load_session(session_id)?;
    Ok(ToolCtx {
        session_id: session_id.to_string(),
        allowed_cwd: session.allowed_cwd.as_ref().map(PathBuf::from),
    })
}

/// 校验某路径是否在 allowed_cwd 内（canonicalize 后比较）
fn require_under_cwd(ctx: &ToolCtx, target: &Path) -> Result<PathBuf, String> {
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
        let parent_canon = fs::canonicalize(parent)
            .map_err(|e| format!("目标父目录无效: {}", e))?;
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

fn truncate(s: String, max: usize) -> String {
    if s.len() <= max {
        s
    } else {
        format!("{}\n… [已截断，共 {} 字节]", &s[..max], s.len())
    }
}

// ========== 工具 schema ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSchema {
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub requires_cwd: bool,
}

pub fn all_tools() -> Vec<ToolSchema> {
    vec![
        ToolSchema {
            name: "Read".into(),
            description: "读取文件内容，返回带行号的文本。path 必须在会话 allowedCwd 下。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "绝对路径或相对 allowedCwd"},
                    "offset": {"type": "integer", "description": "起始行号（1 基）"},
                    "limit": {"type": "integer", "description": "读取行数，缺省 2000"}
                },
                "required": ["path"]
            }),
            requires_cwd: true,
        },
        ToolSchema {
            name: "Write".into(),
            description: "写入/覆盖文件，content 是完整文件内容".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["path", "content"]
            }),
            requires_cwd: true,
        },
        ToolSchema {
            name: "Edit".into(),
            description: "将 path 中的 oldString 替换为 newString。oldString 必须在文件中唯一出现。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "oldString": {"type": "string"},
                    "newString": {"type": "string"}
                },
                "required": ["path", "oldString", "newString"]
            }),
            requires_cwd: true,
        },
        ToolSchema {
            name: "Glob".into(),
            description: "glob 模式匹配文件，相对 allowedCwd".into(),
            parameters: json!({
                "type": "object",
                "properties": {"pattern": {"type": "string"}},
                "required": ["pattern"]
            }),
            requires_cwd: true,
        },
        ToolSchema {
            name: "Grep".into(),
            description: "在 allowedCwd 下按正则搜索（逐行），glob 可选限制文件".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {"type": "string"},
                    "glob": {"type": "string", "description": "文件过滤，如 **/*.ts"}
                },
                "required": ["pattern"]
            }),
            requires_cwd: true,
        },
        ToolSchema {
            name: "Bash".into(),
            description: "在 allowedCwd 中执行 shell 命令，返回 stdout/stderr 合并截断结果".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "timeout": {"type": "integer", "description": "超时毫秒，缺省 60000"}
                },
                "required": ["command"]
            }),
            requires_cwd: true,
        },
        ToolSchema {
            name: "TaskCreate".into(),
            description: "在本会话任务面板新增一条任务".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "subject": {"type": "string"},
                    "description": {"type": "string"},
                    "activeForm": {"type": "string"}
                },
                "required": ["subject", "description"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "TaskUpdate".into(),
            description: "更新任务状态或字段".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "taskId": {"type": "string"},
                    "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
                    "subject": {"type": "string"},
                    "description": {"type": "string"}
                },
                "required": ["taskId"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "TaskList".into(),
            description: "列出本会话所有任务".into(),
            parameters: json!({"type": "object", "properties": {}}),
            requires_cwd: false,
        },
        ToolSchema {
            name: "WebFetch".into(),
            description: "获取任意公开 HTTP(S) URL 的内容。自动识别 HTML / JSON / 纯文本并做对应处理：HTML 剥标签保留正文；JSON 美化输出；纯文本原样；二进制（图片/PDF/压缩包等）只返回大小与类型摘要。支持可选 headers（如 Accept / Authorization），默认超时 20s，响应上限 2MB。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "必填，http(s):// 开头的完整 URL"},
                    "max_bytes": {"type": "integer", "description": "最大返回字节数，默认 500000，上限 2000000"},
                    "headers": {
                        "type": "object",
                        "description": "可选请求头，键值均为字符串。常用：Accept、Authorization、User-Agent",
                        "additionalProperties": {"type": "string"}
                    }
                },
                "required": ["url"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "OpenPath".into(),
            description: "在系统文件管理器（macOS Finder / Windows Explorer / Linux xdg-open）中打开指定路径。可打开文件或目录。".into(),
            parameters: json!({
                "type": "object",
                "properties": {"path": {"type": "string", "description": "绝对路径"}},
                "required": ["path"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "OpenInEditor".into(),
            description: "在代码编辑器中打开指定文件或目录，默认 VS Code。editor 可传可执行路径（如 /usr/local/bin/cursor）或 macOS 应用包路径（如 /Applications/Sublime Text.app）。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "绝对路径"},
                    "editor": {"type": "string", "description": "可选，编辑器路径。不填使用 VS Code"}
                },
                "required": ["path"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "OpenTerminal".into(),
            description: "在指定目录打开终端。macOS 默认 Terminal.app，Windows 可选 powershell/cmd/wt，Linux 用默认 X 终端。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "要切换到的目录绝对路径"},
                    "terminal": {"type": "string", "description": "可选，终端类型：default/iterm/powershell/cmd/wt"}
                },
                "required": ["path"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "OpenUrl".into(),
            description: "在默认浏览器中打开 URL。".into(),
            parameters: json!({
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "CopyFile".into(),
            description: "复制文件或目录（目录递归）。若目标已存在，默认拒绝；overwrite=true 才覆盖。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "src": {"type": "string", "description": "源路径（绝对）"},
                    "dst": {"type": "string", "description": "目标路径（绝对）"},
                    "overwrite": {"type": "boolean", "description": "默认 false"}
                },
                "required": ["src", "dst"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "MoveFile".into(),
            description: "移动/重命名文件或目录。同盘用 rename，跨盘自动 copy+delete。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "src": {"type": "string"},
                    "dst": {"type": "string"},
                    "overwrite": {"type": "boolean", "description": "默认 false"}
                },
                "required": ["src", "dst"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "DeleteFile".into(),
            description: "⚠️ 危险：删除文件或目录（目录需 recursive=true）。无法恢复，调用前务必与用户确认。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "recursive": {"type": "boolean", "description": "删除目录时必须为 true"}
                },
                "required": ["path"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "CreateWorkflow".into(),
            description: "创建一个定时工作流。nodes 支持 web_fetch / llm / webhook 三类节点；cron 为 5 段表达式（分 时 日 月 周）。创建后立即生效。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "cron": {"type": "string", "description": "5 段 cron，如 '0 9 * * *' 每天 9 点"},
                    "enabled": {"type": "boolean", "description": "默认 true"},
                    "nodes": {
                        "type": "array",
                        "description": "节点数组，每个 {id, nodeType, config, dependsOn[]}",
                        "items": {"type": "object"}
                    }
                },
                "required": ["name", "cron", "nodes"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "RunWorkflowNow".into(),
            description: "立即触发一次指定 id 的工作流，忽略 cron 时间。".into(),
            parameters: json!({
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"]
            }),
            requires_cwd: false,
        },
        ToolSchema {
            name: "ListWorkflows".into(),
            description: "列出所有已保存的工作流（含最近一次运行状态）。".into(),
            parameters: json!({"type": "object", "properties": {}}),
            requires_cwd: false,
        },
    ]
}

// ========== Task 存储 ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTask {
    pub id: String,
    pub subject: String,
    pub description: String,
    pub active_form: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

fn read_tasks(session_id: &str) -> Result<Vec<ChatTask>, String> {
    let path = session_tasks_path(session_id)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("读取任务失败: {}", e))?;
    serde_json::from_str(&text).map_err(|e| format!("解析任务失败: {}", e))
}

fn write_tasks(session_id: &str, tasks: &[ChatTask]) -> Result<(), String> {
    let path = session_tasks_path(session_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let text = serde_json::to_string_pretty(tasks).map_err(|e| format!("序列化任务失败: {}", e))?;
    fs::write(&path, text).map_err(|e| format!("写入任务失败: {}", e))
}

// ========== 工具实现 ==========

fn tool_read(ctx: &ToolCtx, args: &Value) -> Result<String, String> {
    let path_str = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let path = require_under_cwd(ctx, Path::new(path_str))?;
    let text = fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))?;
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(2000) as usize;
    let lines: Vec<&str> = text.lines().collect();
    let start = offset.saturating_sub(1);
    let end = (start + limit).min(lines.len());
    let mut out = String::new();
    for (i, line) in lines[start..end].iter().enumerate() {
        out.push_str(&format!("{:>6}\t{}\n", start + i + 1, line));
    }
    Ok(truncate(out, 200_000))
}

fn tool_write(ctx: &ToolCtx, args: &Value) -> Result<String, String> {
    let path_str = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let content = args.get("content").and_then(|v| v.as_str()).ok_or("缺少 content")?;
    let path = require_under_cwd(ctx, Path::new(path_str))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("写入失败: {}", e))?;
    Ok(format!("已写入 {}（{} 字节）", path.display(), content.len()))
}

fn tool_edit(ctx: &ToolCtx, args: &Value) -> Result<String, String> {
    let path_str = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let old = args.get("oldString").and_then(|v| v.as_str()).ok_or("缺少 oldString")?;
    let new = args.get("newString").and_then(|v| v.as_str()).ok_or("缺少 newString")?;
    let path = require_under_cwd(ctx, Path::new(path_str))?;
    let text = fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))?;
    let occurrences = text.matches(old).count();
    if occurrences == 0 {
        return Err("oldString 未在文件中找到".into());
    }
    if occurrences > 1 {
        return Err(format!("oldString 出现 {} 次，必须唯一", occurrences));
    }
    let updated = text.replacen(old, new, 1);
    fs::write(&path, &updated).map_err(|e| format!("写入失败: {}", e))?;
    Ok(format!("已替换 {} 中 1 处", path.display()))
}

fn glob_walk(root: &Path, pattern: &str) -> Result<Vec<PathBuf>, String> {
    // 简化实现：对 pattern 做朴素匹配
    // 支持 **, *, ? 三类
    let regex_src = glob_to_regex(pattern);
    let re = regex_lite(&regex_src)?;
    let mut out = Vec::new();
    walk_dir(root, root, &re, &mut out, 0)?;
    out.sort();
    Ok(out)
}

fn walk_dir(
    base: &Path,
    dir: &Path,
    re: &SimpleRegex,
    out: &mut Vec<PathBuf>,
    depth: u32,
) -> Result<(), String> {
    if depth > 16 {
        return Ok(());
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let fname = entry.file_name().to_string_lossy().to_string();
        // 跳过常见忽略目录
        if path.is_dir()
            && matches!(
                fname.as_str(),
                "node_modules" | ".git" | "target" | "dist" | ".next" | "build" | ".cache"
            )
        {
            continue;
        }
        if path.is_dir() {
            walk_dir(base, &path, re, out, depth + 1)?;
        } else if let Ok(rel) = path.strip_prefix(base) {
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            if re.matches(&rel_str) {
                out.push(rel.to_path_buf());
            }
        }
    }
    Ok(())
}

/// 极简 glob->regex：支持 **, *, ? 和字面字符
fn glob_to_regex(pattern: &str) -> String {
    let mut out = String::from("^");
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' => {
                if chars.peek() == Some(&'*') {
                    chars.next();
                    if chars.peek() == Some(&'/') {
                        chars.next();
                    }
                    out.push_str(".*");
                } else {
                    out.push_str("[^/]*");
                }
            }
            '?' => out.push_str("[^/]"),
            '.' | '+' | '(' | ')' | '|' | '^' | '$' | '{' | '}' | '[' | ']' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out.push('$');
    out
}

/// 超极简"正则"：只实现 `.*`、`[^/]*`、`[^/]`、字面字符、锚点，用于 glob 场景，
/// 避免引入 regex crate。
struct SimpleRegex {
    tokens: Vec<RegexTok>,
}
enum RegexTok {
    Lit(String),
    AnyExceptSlash,     // [^/]
    StarExceptSlash,    // [^/]*
    DotStar,            // .*
}

fn regex_lite(src: &str) -> Result<SimpleRegex, String> {
    let bytes = src.as_bytes();
    let mut i = 0;
    let mut tokens = Vec::new();
    if bytes.first() != Some(&b'^') {
        return Err("regex must start with ^".into());
    }
    i += 1;
    let end = bytes.len().saturating_sub(1);
    while i < end {
        let b = bytes[i];
        if i + 1 < end && bytes[i] == b'.' && bytes[i + 1] == b'*' {
            tokens.push(RegexTok::DotStar);
            i += 2;
        } else if i + 4 < end
            && bytes[i] == b'['
            && bytes[i + 1] == b'^'
            && bytes[i + 2] == b'/'
            && bytes[i + 3] == b']'
            && bytes[i + 4] == b'*'
        {
            tokens.push(RegexTok::StarExceptSlash);
            i += 5;
        } else if i + 3 < end
            && bytes[i] == b'['
            && bytes[i + 1] == b'^'
            && bytes[i + 2] == b'/'
            && bytes[i + 3] == b']'
        {
            tokens.push(RegexTok::AnyExceptSlash);
            i += 4;
        } else if b == b'\\' && i + 1 < end {
            if let Some(RegexTok::Lit(ref mut s)) = tokens.last_mut() {
                s.push(bytes[i + 1] as char);
            } else {
                tokens.push(RegexTok::Lit((bytes[i + 1] as char).to_string()));
            }
            i += 2;
        } else {
            if let Some(RegexTok::Lit(ref mut s)) = tokens.last_mut() {
                s.push(b as char);
            } else {
                tokens.push(RegexTok::Lit((b as char).to_string()));
            }
            i += 1;
        }
    }
    Ok(SimpleRegex { tokens })
}

impl SimpleRegex {
    fn matches(&self, input: &str) -> bool {
        self.match_tokens(&self.tokens, input)
    }
    fn match_tokens(&self, toks: &[RegexTok], s: &str) -> bool {
        if toks.is_empty() {
            return s.is_empty();
        }
        match &toks[0] {
            RegexTok::Lit(lit) => {
                s.starts_with(lit.as_str()) && self.match_tokens(&toks[1..], &s[lit.len()..])
            }
            RegexTok::AnyExceptSlash => {
                let mut it = s.chars();
                match it.next() {
                    Some(c) if c != '/' => self.match_tokens(&toks[1..], it.as_str()),
                    _ => false,
                }
            }
            RegexTok::StarExceptSlash => {
                // 贪婪：尝试 0..n 个非 / 字符
                for i in 0..=s.len() {
                    if s.as_bytes().iter().take(i).any(|b| *b == b'/') {
                        return false;
                    }
                    if self.match_tokens(&toks[1..], &s[i..]) {
                        return true;
                    }
                }
                false
            }
            RegexTok::DotStar => {
                for i in 0..=s.len() {
                    if self.match_tokens(&toks[1..], &s[i..]) {
                        return true;
                    }
                }
                false
            }
        }
    }
}

fn tool_glob(ctx: &ToolCtx, args: &Value) -> Result<String, String> {
    let pattern = args.get("pattern").and_then(|v| v.as_str()).ok_or("缺少 pattern")?;
    let base = ctx
        .allowed_cwd
        .as_ref()
        .ok_or("会话未设置 allowedCwd")?;
    let base_canon = fs::canonicalize(base).map_err(|e| format!("allowedCwd 无效: {}", e))?;
    let files = glob_walk(&base_canon, pattern)?;
    if files.is_empty() {
        return Ok("（无匹配）".into());
    }
    let mut out = String::new();
    for f in files.iter().take(500) {
        out.push_str(&f.to_string_lossy());
        out.push('\n');
    }
    if files.len() > 500 {
        out.push_str(&format!("… 共 {} 个匹配，只展示前 500\n", files.len()));
    }
    Ok(out)
}

fn tool_grep(ctx: &ToolCtx, args: &Value) -> Result<String, String> {
    let pattern = args.get("pattern").and_then(|v| v.as_str()).ok_or("缺少 pattern")?;
    let glob = args.get("glob").and_then(|v| v.as_str()).unwrap_or("**/*");
    let base = ctx
        .allowed_cwd
        .as_ref()
        .ok_or("会话未设置 allowedCwd")?;
    let base_canon = fs::canonicalize(base).map_err(|e| format!("allowedCwd 无效: {}", e))?;
    let files = glob_walk(&base_canon, glob)?;
    let mut out = String::new();
    let mut hits = 0;
    for rel in files.iter() {
        let path = base_canon.join(rel);
        if path.metadata().map(|m| m.len() > 1_000_000).unwrap_or(true) {
            continue;
        }
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => continue,
        };
        for (i, line) in text.lines().enumerate() {
            if line.contains(pattern) {
                out.push_str(&format!("{}:{}: {}\n", rel.display(), i + 1, line.trim()));
                hits += 1;
                if hits >= 200 {
                    out.push_str("… 结果已截断至 200 行\n");
                    return Ok(out);
                }
            }
        }
    }
    if hits == 0 {
        Ok("（无匹配）".into())
    } else {
        Ok(out)
    }
}

async fn tool_bash(ctx: &ToolCtx, args: &Value) -> Result<String, String> {
    let command = args.get("command").and_then(|v| v.as_str()).ok_or("缺少 command")?;
    let timeout_ms = args.get("timeout").and_then(|v| v.as_u64()).unwrap_or(60_000);
    let base = ctx
        .allowed_cwd
        .as_ref()
        .ok_or("会话未设置 allowedCwd")?;
    let base_canon = fs::canonicalize(base).map_err(|e| format!("allowedCwd 无效: {}", e))?;

    #[cfg(target_family = "unix")]
    let mut cmd = {
        let mut c = Command::new("/bin/sh");
        c.arg("-c").arg(command);
        c
    };
    #[cfg(target_family = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(command);
        c
    };
    cmd.current_dir(&base_canon);
    cmd.kill_on_drop(true);

    let fut = cmd.output();
    let output = tokio_timeout(Duration::from_millis(timeout_ms), fut)
        .await
        .map_err(|_| format!("命令超时（{} ms）", timeout_ms))?
        .map_err(|e| format!("执行失败: {}", e))?;

    let mut out = String::new();
    out.push_str(&format!("exit: {}\n", output.status.code().unwrap_or(-1)));
    if !output.stdout.is_empty() {
        out.push_str("---stdout---\n");
        out.push_str(&String::from_utf8_lossy(&output.stdout));
        out.push('\n');
    }
    if !output.stderr.is_empty() {
        out.push_str("---stderr---\n");
        out.push_str(&String::from_utf8_lossy(&output.stderr));
        out.push('\n');
    }
    Ok(truncate(out, 50_000))
}

fn tool_task_create(ctx: &ToolCtx, args: &Value, app: &AppHandle) -> Result<String, String> {
    let subject = args.get("subject").and_then(|v| v.as_str()).ok_or("缺少 subject")?;
    let description = args.get("description").and_then(|v| v.as_str()).ok_or("缺少 description")?;
    let active_form = args.get("activeForm").and_then(|v| v.as_str()).map(|s| s.to_string());
    let mut tasks = read_tasks(&ctx.session_id)?;
    let task = ChatTask {
        id: generate_id(),
        subject: subject.to_string(),
        description: description.to_string(),
        active_form,
        status: "pending".to_string(),
        created_at: current_iso_time(),
        updated_at: current_iso_time(),
    };
    let task_id = task.id.clone();
    tasks.push(task);
    write_tasks(&ctx.session_id, &tasks)?;
    let _ = app.emit("chat-tasks-changed", json!({"sessionId": ctx.session_id}));
    Ok(format!("已创建任务 {}", task_id))
}

fn tool_task_update(ctx: &ToolCtx, args: &Value, app: &AppHandle) -> Result<String, String> {
    let task_id = args.get("taskId").and_then(|v| v.as_str()).ok_or("缺少 taskId")?;
    let mut tasks = read_tasks(&ctx.session_id)?;
    let t = tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("任务不存在: {}", task_id))?;
    if let Some(s) = args.get("status").and_then(|v| v.as_str()) {
        match s {
            "pending" | "in_progress" | "completed" => t.status = s.to_string(),
            _ => return Err(format!("非法 status: {}", s)),
        }
    }
    if let Some(s) = args.get("subject").and_then(|v| v.as_str()) {
        t.subject = s.to_string();
    }
    if let Some(s) = args.get("description").and_then(|v| v.as_str()) {
        t.description = s.to_string();
    }
    t.updated_at = current_iso_time();
    write_tasks(&ctx.session_id, &tasks)?;
    let _ = app.emit("chat-tasks-changed", json!({"sessionId": ctx.session_id}));
    Ok("任务已更新".into())
}

fn tool_task_list(ctx: &ToolCtx) -> Result<String, String> {
    let tasks = read_tasks(&ctx.session_id)?;
    if tasks.is_empty() {
        return Ok("（无任务）".into());
    }
    let mut out = String::new();
    for t in &tasks {
        out.push_str(&format!(
            "[{}] {} — {}\n    id={}\n",
            t.status, t.subject, t.description, t.id
        ));
    }
    Ok(out)
}

// ========== OS open / file ops ==========

async fn tool_open_path(args: &Value) -> Result<String, String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?.to_string();
    crate::commands::system::open_in_explorer(path.clone()).await?;
    Ok(format!("已在文件管理器中打开：{}", path))
}

async fn tool_open_in_editor(args: &Value) -> Result<String, String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?.to_string();
    let editor = args.get("editor").and_then(|v| v.as_str()).map(|s| s.to_string());
    if let Some(e) = &editor {
        if e.contains("&&") || e.contains("||") || e.contains(';') || e.contains('|') || e.contains('`') {
            return Err("editor 参数包含危险字符".into());
        }
    }
    crate::commands::system::open_in_editor(path.clone(), editor.clone()).await?;
    Ok(format!("已在编辑器打开：{}（{}）", path, editor.as_deref().unwrap_or("默认 VS Code")))
}

async fn tool_open_terminal(args: &Value) -> Result<String, String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?.to_string();
    let terminal = args.get("terminal").and_then(|v| v.as_str()).map(|s| s.to_string());
    crate::commands::system::open_in_terminal(path.clone(), terminal, None, None).await?;
    Ok(format!("已在终端打开：{}", path))
}

async fn tool_open_url(args: &Value) -> Result<String, String> {
    let url = args.get("url").and_then(|v| v.as_str()).ok_or("缺少 url")?.to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("仅支持 http/https URL".into());
    }
    crate::commands::system::open_url(url.clone()).await?;
    Ok(format!("已在浏览器打开：{}", url))
}

fn copy_recursively(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let dest = dst.join(entry.file_name());
            copy_recursively(&entry.path(), &dest)?;
        }
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(src, dst)?;
    }
    Ok(())
}

fn tool_copy_file(args: &Value) -> Result<String, String> {
    let src = args.get("src").and_then(|v| v.as_str()).ok_or("缺少 src")?;
    let dst = args.get("dst").and_then(|v| v.as_str()).ok_or("缺少 dst")?;
    let overwrite = args.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(false);
    let src_p = Path::new(src);
    let dst_p = Path::new(dst);
    if !src_p.exists() {
        return Err(format!("源不存在：{}", src));
    }
    if dst_p.exists() && !overwrite {
        return Err(format!("目标已存在（传 overwrite=true 覆盖）：{}", dst));
    }
    if dst_p.exists() && overwrite {
        if dst_p.is_dir() { fs::remove_dir_all(dst_p).map_err(|e| e.to_string())?; }
        else { fs::remove_file(dst_p).map_err(|e| e.to_string())?; }
    }
    copy_recursively(src_p, dst_p).map_err(|e| format!("复制失败: {}", e))?;
    Ok(format!("已复制 {} → {}", src, dst))
}

fn tool_move_file(args: &Value) -> Result<String, String> {
    let src = args.get("src").and_then(|v| v.as_str()).ok_or("缺少 src")?;
    let dst = args.get("dst").and_then(|v| v.as_str()).ok_or("缺少 dst")?;
    let overwrite = args.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(false);
    let src_p = Path::new(src);
    let dst_p = Path::new(dst);
    if !src_p.exists() { return Err(format!("源不存在：{}", src)); }
    if dst_p.exists() && !overwrite {
        return Err(format!("目标已存在（传 overwrite=true 覆盖）：{}", dst));
    }
    if dst_p.exists() && overwrite {
        if dst_p.is_dir() { fs::remove_dir_all(dst_p).map_err(|e| e.to_string())?; }
        else { fs::remove_file(dst_p).map_err(|e| e.to_string())?; }
    }
    match fs::rename(src_p, dst_p) {
        Ok(_) => Ok(format!("已移动 {} → {}", src, dst)),
        Err(_) => {
            // 跨盘：fallback copy + delete
            copy_recursively(src_p, dst_p).map_err(|e| format!("跨盘复制失败: {}", e))?;
            if src_p.is_dir() { fs::remove_dir_all(src_p).map_err(|e| format!("删除源失败: {}", e))?; }
            else { fs::remove_file(src_p).map_err(|e| format!("删除源失败: {}", e))?; }
            Ok(format!("已跨盘移动 {} → {}", src, dst))
        }
    }
}

fn tool_delete_file(args: &Value) -> Result<String, String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let recursive = args.get("recursive").and_then(|v| v.as_bool()).unwrap_or(false);
    let p = Path::new(path);
    if !p.exists() { return Err(format!("路径不存在：{}", path)); }

    // 跨平台受保护路径（大小写不敏感比较）
    let norm = path.trim_end_matches(&['/', '\\'][..]).to_lowercase();
    let dangerous: &[&str] = &[
        // unix
        "/", "/users", "/home", "/etc", "/usr", "/var", "/bin", "/sbin",
        "/system", "/library", "/opt", "/private", "/tmp",
        // windows
        "c:", "c:\\", "c:\\windows", "c:\\program files", "c:\\program files (x86)",
        "c:\\users", "c:\\programdata", "d:", "d:\\",
    ];
    if dangerous.iter().any(|d| norm == *d) {
        return Err(format!("拒绝删除受保护路径：{}", path));
    }
    // 再拒绝 drive root（Windows 任意盘根）
    if cfg!(windows) && norm.len() <= 3 && norm.ends_with(":\\") {
        return Err(format!("拒绝删除盘根：{}", path));
    }

    if p.is_dir() {
        if !recursive { return Err("删除目录需要 recursive=true".into()); }
        fs::remove_dir_all(p).map_err(|e| format!("删除失败: {}", e))?;
    } else {
        fs::remove_file(p).map_err(|e| format!("删除失败: {}", e))?;
    }
    Ok(format!("已删除：{}", path))
}

// ========== 执行入口 ==========

async fn tool_web_fetch(args: &Value) -> Result<String, String> {
    run_web_fetch(args).await
}

/// 供工作流模块调用
pub async fn run_web_fetch_for_workflow(args: &Value) -> Result<String, String> {
    run_web_fetch(args).await
}

async fn run_web_fetch(args: &Value) -> Result<String, String> {
    let url = args.get("url").and_then(|v| v.as_str()).ok_or("缺少 url")?.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("仅支持 http/https URL".into());
    }
    let max_bytes = args
        .get("max_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(500_000)
        .min(2_000_000) as usize;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("codeshelf/0.1 (+https://github.com/)")
        .build()
        .map_err(|e| format!("客户端构建失败: {}", e))?;

    let mut req = client.get(url);
    if let Some(headers) = args.get("headers").and_then(|v| v.as_object()) {
        for (k, v) in headers {
            if let Some(val) = v.as_str() {
                req = req.header(k.as_str(), val);
            }
        }
    }
    let resp = req.send().await.map_err(|e| format!("请求失败: {}", e))?;
    let status = resp.status();
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| format!("读取响应失败: {}", e))?;
    let total_len = bytes.len();
    let truncated = total_len > max_bytes;
    let slice = &bytes[..total_len.min(max_bytes)];

    let ct_lower = content_type.to_lowercase();
    let is_binary_ct = ["image/", "audio/", "video/", "application/octet-stream",
                        "application/pdf", "application/zip", "application/gzip",
                        "application/x-tar", "application/x-7z", "application/x-rar"]
        .iter()
        .any(|p| ct_lower.starts_with(p) || ct_lower.contains(p));

    let body = if is_binary_ct {
        format!("（二进制内容，Content-Type={}，大小={} 字节，已跳过正文）", content_type, total_len)
    } else if ct_lower.contains("application/json") || ct_lower.contains("+json") {
        let raw = String::from_utf8_lossy(slice).to_string();
        match serde_json::from_str::<Value>(&raw) {
            Ok(v) => serde_json::to_string_pretty(&v).unwrap_or(raw),
            Err(_) => raw,
        }
    } else {
        let raw = String::from_utf8_lossy(slice).to_string();
        let looks_html = ct_lower.contains("text/html")
            || ct_lower.contains("application/xhtml")
            || (ct_lower.is_empty() && raw.trim_start().starts_with('<'));
        if looks_html {
            html_to_text(&raw)
        } else {
            raw
        }
    };

    let trailer = if truncated && !is_binary_ct {
        format!("\n\n[已截断，原始 {} 字节；max_bytes={}]", total_len, max_bytes)
    } else {
        String::new()
    };
    Ok(format!(
        "[WebFetch {}]\nURL: {}\nContent-Type: {}\nSize: {} bytes\n\n{}{}",
        status.as_u16(),
        final_url,
        content_type,
        total_len,
        body,
        trailer
    ))
}

/// 最朴素的 HTML → 纯文本转换：去 <script>/<style>，再剥标签、折叠空白。
fn html_to_text(html: &str) -> String {
    let mut s = html.to_string();
    for tag in ["script", "style", "noscript"] {
        loop {
            let open = format!("<{}", tag);
            let close = format!("</{}>", tag);
            let lower = s.to_lowercase();
            let Some(start) = lower.find(&open) else { break };
            let Some(end_rel) = lower[start..].find(&close) else { break };
            let end = start + end_rel + close.len();
            s.replace_range(start..end, "");
        }
    }
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    // 常见实体
    let out = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    // 折叠空白行
    let mut lines: Vec<&str> = out.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    lines.dedup();
    lines.join("\n")
}

pub async fn execute_tool(
    app: &AppHandle,
    session_id: &str,
    tool_name: &str,
    arguments_json: &str,
) -> Result<String, String> {
    let ctx = load_ctx(session_id)?;
    let args: Value = serde_json::from_str(arguments_json).unwrap_or(Value::Object(Default::default()));
    match tool_name {
        "Read" => tool_read(&ctx, &args),
        "Write" => tool_write(&ctx, &args),
        "Edit" => tool_edit(&ctx, &args),
        "Glob" => tool_glob(&ctx, &args),
        "Grep" => tool_grep(&ctx, &args),
        "Bash" => tool_bash(&ctx, &args).await,
        "TaskCreate" => tool_task_create(&ctx, &args, app),
        "TaskUpdate" => tool_task_update(&ctx, &args, app),
        "TaskList" => tool_task_list(&ctx),
        "WebFetch" => tool_web_fetch(&args).await,
        "OpenPath" => tool_open_path(&args).await,
        "OpenInEditor" => tool_open_in_editor(&args).await,
        "OpenTerminal" => tool_open_terminal(&args).await,
        "OpenUrl" => tool_open_url(&args).await,
        "CopyFile" => tool_copy_file(&args),
        "MoveFile" => tool_move_file(&args),
        "DeleteFile" => tool_delete_file(&args),
        "CreateWorkflow" => crate::commands::workflows::tool_create_workflow(&args, app).await,
        "RunWorkflowNow" => crate::commands::workflows::tool_run_workflow_now(&args, app).await,
        "ListWorkflows" => crate::commands::workflows::tool_list_workflows(app).await,
        _ => Err(format!("未知工具: {}", tool_name)),
    }
}

// ========== Tauri 命令 ==========

#[tauri::command]
pub async fn chat_list_tools() -> Result<Vec<ToolSchema>, String> {
    Ok(all_tools())
}

#[tauri::command]
pub async fn chat_execute_tool(
    app: AppHandle,
    session_id: String,
    tool_name: String,
    arguments_json: String,
) -> Result<String, String> {
    execute_tool(&app, &session_id, &tool_name, &arguments_json).await
}

#[tauri::command]
pub async fn list_chat_tasks(session_id: String) -> Result<Vec<ChatTask>, String> {
    read_tasks(&session_id)
}

#[tauri::command]
pub async fn create_chat_task(
    app: AppHandle,
    session_id: String,
    subject: String,
    description: String,
    active_form: Option<String>,
) -> Result<ChatTask, String> {
    let mut tasks = read_tasks(&session_id)?;
    let task = ChatTask {
        id: generate_id(),
        subject,
        description,
        active_form,
        status: "pending".to_string(),
        created_at: current_iso_time(),
        updated_at: current_iso_time(),
    };
    let copy = task.clone();
    tasks.push(task);
    write_tasks(&session_id, &tasks)?;
    let _ = app.emit("chat-tasks-changed", json!({"sessionId": session_id}));
    Ok(copy)
}

#[tauri::command]
pub async fn update_chat_task(
    app: AppHandle,
    session_id: String,
    task_id: String,
    status: Option<String>,
    subject: Option<String>,
    description: Option<String>,
) -> Result<ChatTask, String> {
    let mut tasks = read_tasks(&session_id)?;
    let t = tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("任务不存在: {}", task_id))?;
    if let Some(s) = status {
        t.status = s;
    }
    if let Some(s) = subject {
        t.subject = s;
    }
    if let Some(s) = description {
        t.description = s;
    }
    t.updated_at = current_iso_time();
    let copy = t.clone();
    write_tasks(&session_id, &tasks)?;
    let _ = app.emit("chat-tasks-changed", json!({"sessionId": session_id}));
    Ok(copy)
}

#[tauri::command]
pub async fn delete_chat_task(
    app: AppHandle,
    session_id: String,
    task_id: String,
) -> Result<(), String> {
    let mut tasks = read_tasks(&session_id)?;
    tasks.retain(|t| t.id != task_id);
    write_tasks(&session_id, &tasks)?;
    let _ = app.emit("chat-tasks-changed", json!({"sessionId": session_id}));
    Ok(())
}

// 占位：某些未来可能用到的全局状态，保留 Arc<RwLock> 语法避免 clippy 抱怨
#[allow(dead_code)]
static _PLACEHOLDER: once_cell::sync::Lazy<Arc<RwLock<HashMap<String, ()>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));