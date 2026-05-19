// 简历功能持久化命令
//
// 设计原则：
// - 简历背景知识按 project_id 一文件一项目，存到 <data_dir>/resume_knowledge/<id>.md
// - 重新生成前由 save_resume_knowledge 自动备份旧版本到 <id>.history/<timestamp>.md
// - 旧的 save_resumes/get_resumes（生成的完整简历）从 settings 模块迁移到这里，整体内聚

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{AppError, AppResult};
use crate::storage::db::pool;
use crate::storage::get_storage_config;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LlmProxyHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LlmProxyRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<LlmProxyHeader>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LlmProxyResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<LlmProxyHeader>,
    pub body: String,
}

#[tauri::command]
#[specta::specta]
pub async fn llm_proxy_request(request: LlmProxyRequest) -> AppResult<LlmProxyResponse> {
    let url = reqwest::Url::parse(request.url.trim())
        .map_err(|e| AppError::invalid(format!("模型请求 URL 不合法: {}", e)))?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err(AppError::invalid("模型请求只允许 http/https")),
    }

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|e| AppError::invalid(format!("模型请求 method 不合法: {}", e)))?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| AppError::from(format!("创建模型请求客户端失败: {}", e)))?;

    let url_text = url.as_str().to_string();
    let mut builder = client.request(method, url);
    for header in request.headers {
        let name = header.name.trim();
        if name.is_empty() {
            continue;
        }
        let lower = name.to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "host" | "content-length" | "connection" | "transfer-encoding" | "accept-encoding"
        ) {
            continue;
        }
        let Ok(header_name) = reqwest::header::HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        let Ok(header_value) = reqwest::header::HeaderValue::from_str(&header.value) else {
            continue;
        };
        builder = builder.header(header_name, header_value);
    }

    if let Some(body) = request.body {
        let body = force_non_stream_body(body, &url_text);
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| AppError::from(format!("模型请求失败: {}", e)))?;
    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers = response
        .headers()
        .iter()
        .filter(|(name, _)| {
            !matches!(
                name.as_str(),
                "content-length" | "content-encoding" | "transfer-encoding" | "connection"
            )
        })
        .filter_map(|(name, value)| {
            value.to_str().ok().map(|v| LlmProxyHeader {
                name: name.as_str().to_string(),
                value: v.to_string(),
            })
        })
        .collect();
    let body = response
        .text()
        .await
        .map_err(|e| AppError::from(format!("读取模型响应失败: {}", e)))?;

    Ok(LlmProxyResponse {
        status: status.as_u16(),
        status_text,
        headers,
        body,
    })
}

fn force_non_stream_body(body: String, url: &str) -> String {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&body) else {
        return body;
    };
    if let Some(obj) = value.as_object_mut() {
        if obj.get("stream").and_then(|v| v.as_bool()) == Some(true) {
            obj.insert("stream".to_string(), serde_json::Value::Bool(false));
        }
        obj.remove("stream_options");
        if url.to_ascii_lowercase().contains("deepseek") {
            obj.insert(
                "thinking".to_string(),
                serde_json::json!({ "type": "disabled" }),
            );
            obj.remove("enable_thinking");
        } else {
            obj.insert(
                "enable_thinking".to_string(),
                serde_json::Value::Bool(false),
            );
            obj.remove("thinking");
        }
        obj.remove("reasoning");
        obj.remove("reasoning_effort");
        obj.remove("reasoning_content");
        obj.insert(
            "parallel_tool_calls".to_string(),
            serde_json::Value::Bool(false),
        );
        if let Some(messages) = obj.get_mut("messages").and_then(|v| v.as_array_mut()) {
            for msg in messages {
                if let Some(msg_obj) = msg.as_object_mut() {
                    msg_obj.remove("reasoning_content");
                }
            }
        }
    }
    serde_json::to_string(&value).unwrap_or(body)
}

// ============== 简历完整数据持久化（从 settings 模块迁移） ==============

#[tauri::command]
#[specta::specta]
pub async fn get_resumes() -> AppResult<serde_json::Value> {
    let config = get_storage_config()?;
    let path = config.resumes_file();

    if !path.exists() {
        return Ok(serde_json::json!([]));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::from(format!("读取简历数据失败: {}", e)))?;

    if content.trim().is_empty() {
        return Ok(serde_json::json!([]));
    }

    let data: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!([]));
    Ok(data)
}

#[tauri::command]
#[specta::specta]
pub async fn save_resumes(data: serde_json::Value) -> AppResult<()> {
    let config = get_storage_config()?;
    config.ensure_dirs()?;

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| AppError::from(format!("序列化简历数据失败: {}", e)))?;

    fs::write(config.resumes_file(), content)
        .map_err(|e| AppError::from(format!("保存简历数据失败: {}", e)))?;
    Ok(())
}

// ============== 项目背景知识 ==============

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ResumeKnowledgeHistoryEntry {
    /// 文件名上的 timestamp（毫秒级 unix），同时充当主键
    pub timestamp: String,
    /// 文件字节数（便于 UI 给个尺寸提示）
    pub size: u64,
}

fn timestamp_ms() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_millis())
}

#[tauri::command]
#[specta::specta]
pub async fn save_resume_knowledge(
    project_id: String,
    content: String,
    _user_edited: bool,
) -> AppResult<()> {
    if project_id.trim().is_empty() {
        return Err(AppError::invalid("project_id 不能为空"));
    }
    let config = get_storage_config()?;
    config.ensure_dirs()?;
    let target = config.resume_knowledge_file(&project_id);

    // 备份旧版本
    if target.exists() {
        let history_dir = config.resume_knowledge_history_dir(&project_id);
        fs::create_dir_all(&history_dir)
            .map_err(|e| AppError::from(format!("创建历史目录失败: {}", e)))?;
        let backup_name = format!("{}.md", timestamp_ms());
        let backup_path = history_dir.join(backup_name);
        fs::copy(&target, &backup_path)
            .map_err(|e| AppError::from(format!("备份历史版本失败: {}", e)))?;
    }

    // 确保父目录存在
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::from(format!("创建知识目录失败: {}", e)))?;
    }

    fs::write(&target, content).map_err(|e| AppError::from(format!("写入背景知识失败: {}", e)))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn load_resume_knowledge(project_id: String) -> AppResult<Option<String>> {
    if project_id.trim().is_empty() {
        return Err(AppError::invalid("project_id 不能为空"));
    }
    let config = get_storage_config()?;
    let target = config.resume_knowledge_file(&project_id);
    if !target.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&target)
        .map_err(|e| AppError::from(format!("读取背景知识失败: {}", e)))?;
    Ok(Some(content))
}

#[tauri::command]
#[specta::specta]
pub async fn list_resume_knowledge() -> AppResult<Vec<String>> {
    let config = get_storage_config()?;
    let dir = config.resume_knowledge_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut ids = Vec::new();
    let entries =
        fs::read_dir(&dir).map_err(|e| AppError::from(format!("读取知识目录失败: {}", e)))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            ids.push(stem.to_string());
        }
    }
    Ok(ids)
}

#[tauri::command]
#[specta::specta]
pub async fn list_resume_knowledge_history(
    project_id: String,
) -> AppResult<Vec<ResumeKnowledgeHistoryEntry>> {
    if project_id.trim().is_empty() {
        return Err(AppError::invalid("project_id 不能为空"));
    }
    let config = get_storage_config()?;
    let dir = config.resume_knowledge_history_dir(&project_id);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    let read =
        fs::read_dir(&dir).map_err(|e| AppError::from(format!("读取历史目录失败: {}", e)))?;
    for entry in read.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        entries.push(ResumeKnowledgeHistoryEntry {
            timestamp: stem,
            size,
        });
    }
    // 按 timestamp 倒序（最近的优先）
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

#[tauri::command]
#[specta::specta]
pub async fn read_resume_knowledge_history(
    project_id: String,
    timestamp: String,
) -> AppResult<String> {
    if project_id.trim().is_empty() || timestamp.trim().is_empty() {
        return Err(AppError::invalid("project_id 或 timestamp 不能为空"));
    }
    // 防止路径穿越
    if timestamp.contains('/') || timestamp.contains('\\') || timestamp.contains("..") {
        return Err(AppError::invalid("非法 timestamp"));
    }
    let config = get_storage_config()?;
    let path = config
        .resume_knowledge_history_dir(&project_id)
        .join(format!("{}.md", timestamp));
    if !path.exists() {
        return Err(AppError::invalid("历史版本不存在"));
    }
    fs::read_to_string(&path).map_err(|e| AppError::from(format!("读取历史版本失败: {}", e)))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_resume_knowledge(project_id: String) -> AppResult<()> {
    if project_id.trim().is_empty() {
        return Err(AppError::invalid("project_id 不能为空"));
    }
    let config = get_storage_config()?;
    let target = config.resume_knowledge_file(&project_id);
    if target.exists() {
        fs::remove_file(&target).map_err(|e| AppError::from(format!("删除背景知识失败: {}", e)))?;
    }
    Ok(())
}

// ============== Agent 项目文件读取工具 ==============

const READ_CHAR_LIMIT: usize = 10_000;
const GREP_MATCH_LIMIT: usize = 50;
const GREP_LINE_LENGTH_LIMIT: usize = 240;
const GREP_FILE_SIZE_LIMIT: u64 = 512 * 1024;
const MAX_WALK_DEPTH: usize = 8;
const MAX_GREP_SCANNED_FILES: usize = 5_000;
const MAX_INDEX_DEPTH: usize = 16;
const MAX_INDEX_FILES: usize = 20_000;

const BUILTIN_IGNORE_RULES: &[&str] = &[
    ".git/",
    "node_modules/",
    "target/",
    "dist/",
    "build/",
    ".next/",
    "out/",
    ".vscode/",
    ".idea/",
    ".DS_Store",
    "*.log",
    "*.lock",
    "*.min.js",
    "*.min.css",
    "*.map",
];

async fn project_root_by_id(project_id: &str) -> AppResult<PathBuf> {
    if project_id.trim().is_empty() {
        return Err(AppError::invalid("project_id 不能为空"));
    }
    let row: Option<(String,)> = sqlx::query_as("SELECT path FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(pool())
        .await
        .map_err(|e| AppError::from(format!("查询项目路径失败: {}", e)))?;
    let Some((path,)) = row else {
        return Err(AppError::invalid("项目不存在"));
    };
    let root = PathBuf::from(path);
    if !root.exists() || !root.is_dir() {
        return Err(AppError::invalid("项目路径不存在或不是目录"));
    }
    root.canonicalize()
        .map_err(|e| AppError::from(format!("解析项目路径失败: {}", e)))
}

fn normalize_rel_path(input: &str) -> AppResult<String> {
    let trimmed = input.trim().replace('\\', "/");
    let without_prefix = trimmed
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string();
    if without_prefix.contains('\0') {
        return Err(AppError::invalid("路径不合法"));
    }
    let path = Path::new(&without_prefix);
    if path.is_absolute() {
        return Err(AppError::invalid("路径不允许是绝对路径"));
    }
    for comp in path.components() {
        if matches!(
            comp,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        ) {
            return Err(AppError::invalid("路径不允许越界"));
        }
    }
    Ok(without_prefix)
}

fn join_project_path(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let rel = normalize_rel_path(rel)?;
    let target = if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    if target.exists() {
        let canonical = target
            .canonicalize()
            .map_err(|e| AppError::from(format!("解析路径失败: {}", e)))?;
        if !canonical.starts_with(root) {
            return Err(AppError::invalid("路径不允许越界"));
        }
        Ok(canonical)
    } else {
        Ok(target)
    }
}

#[derive(Debug, Clone)]
struct IgnoreRule {
    pattern: String,
    dir_only: bool,
    anchored: bool,
    has_slash: bool,
}

fn parse_ignore_rule(line: &str) -> Option<IgnoreRule> {
    let mut raw = line.trim();
    if raw.is_empty() || raw.starts_with('#') || raw.starts_with('!') {
        return None;
    }
    let anchored = raw.starts_with('/');
    raw = raw.trim_start_matches('/');
    let dir_only = raw.ends_with('/');
    raw = raw.trim_end_matches('/');
    if raw.is_empty() {
        return None;
    }
    Some(IgnoreRule {
        pattern: raw.replace('\\', "/"),
        dir_only,
        anchored,
        has_slash: raw.contains('/'),
    })
}

fn load_ignore_rules(root: &Path) -> Vec<IgnoreRule> {
    let mut rules: Vec<IgnoreRule> = BUILTIN_IGNORE_RULES
        .iter()
        .filter_map(|r| parse_ignore_rule(r))
        .collect();
    for name in [".gitignore", ".codeshelfignore"] {
        let path = root.join(name);
        if let Ok(content) = fs::read_to_string(path) {
            rules.extend(content.lines().filter_map(parse_ignore_rule));
        }
    }
    rules
}

fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p = pattern.as_bytes();
    let t = text.as_bytes();
    let (mut pi, mut ti) = (0usize, 0usize);
    let mut star: Option<usize> = None;
    let mut match_i = 0usize;

    while ti < t.len() {
        if pi < p.len() && (p[pi] == b'?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == b'*' {
            star = Some(pi);
            match_i = ti;
            pi += 1;
        } else if let Some(star_i) = star {
            pi = star_i + 1;
            match_i += 1;
            ti = match_i;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == b'*' {
        pi += 1;
    }
    pi == p.len()
}

fn basename(rel: &str) -> &str {
    rel.rsplit('/').next().unwrap_or(rel)
}

fn is_ignored(rules: &[IgnoreRule], rel: &str, is_dir: bool) -> bool {
    let rel = rel.trim_matches('/');
    if rel.is_empty() {
        return false;
    }
    for rule in rules {
        if rule.dir_only && !is_dir {
            continue;
        }
        let matched = if rule.anchored || rule.has_slash {
            wildcard_match(&rule.pattern, rel)
        } else {
            rel.split('/').any(|seg| wildcard_match(&rule.pattern, seg))
                || wildcard_match(&rule.pattern, basename(rel))
        };
        if matched {
            return true;
        }
    }
    false
}

#[tauri::command]
#[specta::specta]
pub async fn resume_project_list_dir(project_id: String, path: String) -> AppResult<String> {
    let root = project_root_by_id(&project_id).await?;
    let rules = load_ignore_rules(&root);
    let rel = normalize_rel_path(&path)?;
    if !rel.is_empty() && is_ignored(&rules, &rel, true) {
        return Ok(format!("[error] 该目录被 ignore 规则排除: {}", rel));
    }
    let abs = join_project_path(&root, &rel)?;
    let read = fs::read_dir(&abs).map_err(|e| AppError::from(format!("读取目录失败: {}", e)))?;
    let mut visible = Vec::new();
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel, name)
        };
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_ignored(&rules, &child_rel, is_dir) {
            continue;
        }
        visible.push(if is_dir { format!("{}/", name) } else { name });
    }
    visible.sort();
    if visible.is_empty() {
        Ok(format!(
            "[empty] {} 下没有可见条目",
            if rel.is_empty() { "(root)" } else { &rel }
        ))
    } else {
        Ok(visible.join("\n"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ResumeProjectIndexFile {
    pub path: String,
    pub size: u64,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ResumeProjectIndexStats {
    pub file_count: u32,
    pub directory_count: u32,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ResumeProjectIndex {
    pub root_name: String,
    pub files: Vec<ResumeProjectIndexFile>,
    pub directories: Vec<String>,
    pub stats: ResumeProjectIndexStats,
}

fn collect_index(
    root: &Path,
    rules: &[IgnoreRule],
    rel: &str,
    depth: usize,
    files: &mut Vec<ResumeProjectIndexFile>,
    directories: &mut Vec<String>,
    total_bytes: &mut u64,
) -> AppResult<()> {
    if depth > MAX_INDEX_DEPTH {
        return Ok(());
    }
    if files.len() >= MAX_INDEX_FILES {
        return Err(AppError::invalid(format!(
            "项目可见文件超过 {} 个，索引已停止。请先通过 .codeshelfignore 排除无关目录后再生成背景知识。",
            MAX_INDEX_FILES
        )));
    }

    let abs = if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    let read = fs::read_dir(abs).map_err(|e| AppError::from(format!("读取项目索引失败: {}", e)))?;
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() {
            name
        } else {
            format!("{}/{}", rel, name)
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let is_dir = file_type.is_dir();
        if is_ignored(rules, &child_rel, is_dir) {
            continue;
        }
        if is_dir {
            directories.push(child_rel.clone());
            collect_index(
                root,
                rules,
                &child_rel,
                depth + 1,
                files,
                directories,
                total_bytes,
            )?;
        } else if file_type.is_file() {
            if files.len() >= MAX_INDEX_FILES {
                return Err(AppError::invalid(format!(
                    "项目可见文件超过 {} 个，索引已停止。请先通过 .codeshelfignore 排除无关目录后再生成背景知识。",
                    MAX_INDEX_FILES
                )));
            }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            *total_bytes = total_bytes.saturating_add(size);
            let extension = Path::new(&child_rel)
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase());
            files.push(ResumeProjectIndexFile {
                path: child_rel,
                size,
                extension,
            });
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn resume_project_index(project_id: String) -> AppResult<ResumeProjectIndex> {
    let root = project_root_by_id(&project_id).await?;
    let rules = load_ignore_rules(&root);
    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut total_bytes = 0u64;
    collect_index(
        &root,
        &rules,
        "",
        0,
        &mut files,
        &mut directories,
        &mut total_bytes,
    )?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    directories.sort();
    let root_name = root
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("project")
        .to_string();
    Ok(ResumeProjectIndex {
        root_name,
        stats: ResumeProjectIndexStats {
            file_count: files.len() as u32,
            directory_count: directories.len() as u32,
            total_bytes,
        },
        files,
        directories,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn resume_project_read_file(project_id: String, path: String) -> AppResult<String> {
    let root = project_root_by_id(&project_id).await?;
    let rules = load_ignore_rules(&root);
    let rel = normalize_rel_path(&path)?;
    if rel.is_empty() {
        return Ok(format!("[error] 路径不合法: {}", path));
    }
    if is_ignored(&rules, &rel, false) {
        return Ok(format!("[error] 该文件被 ignore 规则排除: {}", rel));
    }
    let abs = join_project_path(&root, &rel)?;
    if !abs.exists() {
        return Ok(format!("[error] 文件不存在: {}", rel));
    }
    let content =
        fs::read_to_string(&abs).map_err(|e| AppError::from(format!("读取文件失败: {}", e)))?;
    if content.chars().count() > READ_CHAR_LIMIT {
        Ok(format!(
            "{}\n\n[truncated at {} chars]",
            content.chars().take(READ_CHAR_LIMIT).collect::<String>(),
            READ_CHAR_LIMIT
        ))
    } else {
        Ok(content)
    }
}

fn collect_files(
    root: &Path,
    rules: &[IgnoreRule],
    rel: &str,
    depth: usize,
    out: &mut Vec<String>,
) {
    if depth > MAX_WALK_DEPTH || out.len() >= MAX_GREP_SCANNED_FILES {
        return;
    }
    let abs = if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    let Ok(read) = fs::read_dir(abs) else {
        return;
    };
    for entry in read.flatten() {
        if out.len() >= MAX_GREP_SCANNED_FILES {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() {
            name
        } else {
            format!("{}/{}", rel, name)
        };
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_ignored(rules, &child_rel, is_dir) {
            continue;
        }
        if is_dir {
            collect_files(root, rules, &child_rel, depth + 1, out);
        } else {
            out.push(child_rel);
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn resume_project_grep(
    project_id: String,
    pattern: String,
    glob: Option<String>,
) -> AppResult<String> {
    if pattern.trim().is_empty() {
        return Ok("[error] pattern 不能为空".to_string());
    }
    let root = project_root_by_id(&project_id).await?;
    let rules = load_ignore_rules(&root);
    let mut files = Vec::new();
    collect_files(&root, &rules, "", 0, &mut files);
    let needle = pattern.to_lowercase();
    let glob = glob.map(|g| g.replace('\\', "/"));
    let mut matches = Vec::new();
    let mut scanned = 0usize;

    for rel in files {
        if let Some(g) = &glob {
            if !wildcard_match(g, &rel) && !wildcard_match(g, basename(&rel)) {
                continue;
            }
        }
        scanned += 1;
        let abs = root.join(&rel);
        if fs::metadata(&abs)
            .map(|m| m.len() > GREP_FILE_SIZE_LIMIT)
            .unwrap_or(true)
        {
            continue;
        }
        let Ok(content) = fs::read_to_string(&abs) else {
            continue;
        };
        for (idx, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&needle) {
                let shown = if line.chars().count() > GREP_LINE_LENGTH_LIMIT {
                    format!(
                        "{}...",
                        line.chars()
                            .take(GREP_LINE_LENGTH_LIMIT)
                            .collect::<String>()
                    )
                } else {
                    line.to_string()
                };
                matches.push(format!("{}:{}: {}", rel, idx + 1, shown));
                if matches.len() >= GREP_MATCH_LIMIT {
                    break;
                }
            }
        }
        if matches.len() >= GREP_MATCH_LIMIT {
            break;
        }
    }

    if matches.is_empty() {
        Ok(format!("[empty] 未找到匹配项（已扫描 {} 个文件）", scanned))
    } else {
        let suffix = if matches.len() >= GREP_MATCH_LIMIT {
            format!("\n\n[truncated at {} matches]", GREP_MATCH_LIMIT)
        } else {
            String::new()
        };
        Ok(format!("{}{}", matches.join("\n"), suffix))
    }
}
