// 项目知识抽取 agent:两步推理(规划文件 → 读文件 → 生成 background markdown)。
//
// 取代前端的 knowledgeAgent.ts:233-359。逻辑完全相同,只是把过程式翻译到 Rust:
//   1. 调 resume_project_index 拿到完整索引
//   2. 程序侧打分 + 筛选 top 候选 → 构造 indexSummary 喂给 LLM
//   3. LLM 返回 JSON 计划 (规划要读的文件列表)
//   4. 循环 read_file 读取每个计划文件,边读边 emit step
//   5. LLM 第二次调用:基于索引摘要 + 文件内容产出 /background.md
//
// 不用 deepagents / 任何 agent 框架:这就是两次 chat_completion + 中间夹文件读取。

use std::collections::BTreeMap;
use std::sync::Arc;

use chrono::Utc;
use once_cell::sync::Lazy;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::llm::{chat_completion, pick_model, ChatMessage};
use super::types::{
    AgentStepEvent, AgentStepKind, RunKnowledgeAgentRequest, RunKnowledgeAgentResponse,
};
use crate::commands::resume::{
    resume_project_index, resume_project_read_file, ResumeProjectIndex, ResumeProjectIndexFile,
};
use crate::error::{AppError, AppResult};
use crate::storage::schema::Project;

const MAX_PLAN_FILES: usize = 45;
const MAX_CANDIDATE_FILES: usize = 220;
const MAX_CONTEXT_CHARS: usize = 120_000;
const STEP_EVENT: &str = "knowledge-agent-step";

static KNOWLEDGE_AGENT_ABORTS: Lazy<Arc<RwLock<std::collections::HashMap<String, AbortHandle>>>> =
    Lazy::new(|| Arc::new(RwLock::new(std::collections::HashMap::new())));

#[tauri::command]
#[specta::specta]
pub async fn run_knowledge_agent(
    app: AppHandle,
    request: RunKnowledgeAgentRequest,
) -> AppResult<RunKnowledgeAgentResponse> {
    let request_id = request.request_id.clone();
    let app_handle = app.clone();

    let join = tokio::spawn(async move { run_inner(app_handle, request).await });
    let abort = join.abort_handle();
    KNOWLEDGE_AGENT_ABORTS
        .write()
        .await
        .insert(request_id.clone(), abort);

    let result = join.await;
    KNOWLEDGE_AGENT_ABORTS.write().await.remove(&request_id);

    match result {
        Ok(inner) => inner,
        Err(e) if e.is_cancelled() => Err(AppError::from("用户已取消")),
        Err(e) => Err(AppError::from(format!("Agent 任务异常退出: {}", e))),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_knowledge_agent(request_id: String) -> AppResult<()> {
    if let Some(handle) = KNOWLEDGE_AGENT_ABORTS.write().await.remove(&request_id) {
        handle.abort();
    }
    Ok(())
}

async fn run_inner(
    app: AppHandle,
    request: RunKnowledgeAgentRequest,
) -> AppResult<RunKnowledgeAgentResponse> {
    let request_id = request.request_id.clone();
    let model_config = pick_model(&request.provider)?;
    let model = model_config.model.clone();

    let project = load_project(&request.project_id).await?;

    emit_step(&app, &request_id, AgentStepKind::ToolCall, Some("建立项目索引".into()), None);
    let index = resume_project_index(request.project_id.clone()).await?;
    emit_step(
        &app,
        &request_id,
        AgentStepKind::ToolResult,
        Some("项目索引完成".into()),
        Some(format!(
            "{} 个文件, {} 个目录",
            index.stats.file_count, index.stats.directory_count
        )),
    );

    let index_summary = build_index_summary(&index, &project);

    // ----- 第一轮:规划要读哪些文件 -----
    emit_step(&app, &request_id, AgentStepKind::LlmText, Some("规划需要读取的关键文件".into()), None);
    let plan_messages = vec![
        ChatMessage::system(
            "你是资深技术架构师。你只能基于用户提供的项目索引规划读取哪些文件。必须返回严格 JSON,不要 Markdown。"
                .to_string(),
        ),
        ChatMessage::user(format!(
            "请从候选关键文件中选择最能支持生成项目背景知识的文件。\n\
             最多选择 {} 个。优先 README、依赖文件、入口、路由、状态管理、后端 controller/service、数据库/存储、AI/工具相关模块。\n\
             返回格式:{{\"files\":[\"path\"],\"reasons\":{{\"path\":\"选择原因\"}}}}\n\n{}",
            MAX_PLAN_FILES, index_summary
        )),
    ];
    let plan_resp = chat_completion(&request.provider, &model, &plan_messages, None, 0.2).await?;
    let parsed_plan = safe_parse_json(&plan_resp.content)
        .ok_or_else(|| AppError::from("模型没有返回合法 JSON"))?;
    let mut planned_files = normalize_plan(&parsed_plan, &index);
    if planned_files.is_empty() {
        planned_files = fallback_plan(&index);
    }
    if planned_files.is_empty() {
        return Err(AppError::from("没有找到可读取的关键项目文件"));
    }
    emit_step(
        &app,
        &request_id,
        AgentStepKind::TodoUpdate,
        None,
        Some(format!("计划读取 {} 个文件", planned_files.len())),
    );

    // ----- 读文件循环 -----
    let mut read_files: Vec<(String, String)> = Vec::with_capacity(planned_files.len());
    for path in &planned_files {
        emit_step(
            &app,
            &request_id,
            AgentStepKind::ToolCall,
            Some("读取文件".into()),
            Some(path.clone()),
        );
        let content = resume_project_read_file(request.project_id.clone(), path.clone()).await?;
        let len = content.chars().count();
        read_files.push((path.clone(), content));
        emit_step(
            &app,
            &request_id,
            AgentStepKind::ToolResult,
            Some(path.clone()),
            Some(format!("{} 字符", len)),
        );
    }

    // ----- 第二轮:生成背景知识 markdown -----
    emit_step(&app, &request_id, AgentStepKind::LlmText, Some("生成背景知识文档".into()), None);
    let context = build_file_context(&read_files);
    let intro_line = if request.initial_background.is_some() {
        "这是更新流程。请结合现有背景知识和当前读到的项目文件,输出完整最新版 /background.md 内容。"
    } else {
        "这是首次生成流程。请输出完整 /background.md 内容。"
    };
    let existing_section = match &request.initial_background {
        Some(s) if !s.trim().is_empty() => format!("现有背景知识:\n{}", s),
        _ => "现有背景知识:无".to_string(),
    };
    let final_messages = vec![
        ChatMessage::system(
            "你是一名资深技术架构师,正在为求职者整理项目背景知识文档。所有事实必须来自项目索引和已读取文件,禁止编造。用中文输出 Markdown。"
                .to_string(),
        ),
        ChatMessage::user(format!(
            "{intro}\n\n固定章节:\n# {{项目名}}\n## 项目概览\n## 技术栈详情\n## 核心功能模块\n## 架构亮点\n## 可挂载 JD 关键词\n\n\
             约束:\n\
             - 技术栈必须来自依赖文件、配置文件或代码。\n\
             - 量化指标只在 README 或代码中明确出现时引用。\n\
             - 核心功能模块必须列出入口路径、关键文件、实现要点。\n\
             - 不要贴整段源码。\n\
             - 如果某类信息无法从文件确认,请写\"未从当前项目文件确认\"。\n\n\
             项目索引摘要:\n{idx}\n\n{existing}\n\n已读取文件内容:\n{ctx}",
            intro = intro_line,
            idx = index_summary,
            existing = existing_section,
            ctx = context,
        )),
    ];
    let final_resp = chat_completion(&request.provider, &model, &final_messages, None, 0.2).await?;
    let background = final_resp.content.trim().to_string();
    if background.is_empty() {
        return Err(AppError::from("模型没有产出背景知识内容"));
    }
    Ok(RunKnowledgeAgentResponse { background })
}

// =================== project 加载 ===================

async fn load_project(project_id: &str) -> AppResult<Project> {
    let all = crate::commands::project::get_projects().await?;
    all.into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| AppError::invalid(format!("项目不存在: {}", project_id)))
}

// =================== 评分 / 索引摘要 (port from knowledgeAgent.ts:86-189) ===================

fn is_text_like(file: &ResumeProjectIndexFile) -> bool {
    let ext = file.extension.as_deref().unwrap_or("");
    if ext.is_empty() {
        let name = file.path.rsplit('/').next().unwrap_or(file.path.as_str());
        let name_lower = name.to_lowercase();
        return matches!(
            name_lower.as_str(),
            "readme" | "dockerfile" | "makefile" | "license" | "notice"
        );
    }
    const ALLOWED: &[&str] = &[
        "ts", "tsx", "js", "jsx", "vue", "svelte", "rs", "java", "kt", "go", "py", "cs", "php",
        "rb", "md", "json", "toml", "yaml", "yml", "xml", "gradle", "properties", "env", "sql",
        "html", "css", "scss",
    ];
    ALLOWED.iter().any(|a| ext == *a)
}

fn score_file(file: &ResumeProjectIndexFile) -> i32 {
    let p = file.path.replace('\\', "/");
    let name = p.rsplit('/').next().unwrap_or(&p);
    let name_lower = name.to_lowercase();
    let path_lower = p.to_lowercase();
    let mut score = 0i32;

    if name_lower.starts_with("readme") {
        score += 1000;
    }
    if matches!(
        name_lower.as_str(),
        "package.json"
            | "pom.xml"
            | "build.gradle"
            | "settings.gradle"
            | "cargo.toml"
            | "go.mod"
            | "pyproject.toml"
            | "requirements.txt"
            | "composer.json"
            | "gemfile"
            | "tauri.conf.json"
    ) {
        score += 900;
    }
    const CONFIG_PREFIXES: &[&str] = &[
        "vite",
        "webpack",
        "rollup",
        "next",
        "nuxt",
        "svelte",
        "tsconfig",
        "eslint",
        "prettier",
        "tailwind",
        "docker",
        "compose",
        "dockerfile",
    ];
    if CONFIG_PREFIXES
        .iter()
        .any(|pfx| name_lower.starts_with(pfx))
    {
        score += 420;
    }
    const DIR_NAMES: &[&str] = &[
        "src",
        "app",
        "pages",
        "router",
        "routes",
        "store",
        "stores",
        "api",
        "services",
        "components",
        "commands",
        "controllers",
        "service",
        "domain",
        "models",
    ];
    if DIR_NAMES.iter().any(|d| {
        let in_middle = format!("/{}/", d);
        let at_start = format!("{}/", d);
        path_lower.contains(&in_middle) || path_lower.starts_with(&at_start)
    }) {
        score += 180;
    }
    const ENTRY_NAMES: &[&str] = &["main", "index", "app", "root", "layout", "server", "lib"];
    const ENTRY_EXTS: &[&str] = &["ts", "tsx", "js", "jsx", "vue", "rs", "java", "go", "py"];
    let (base, ext) = match name_lower.rsplit_once('.') {
        Some((b, e)) => (b.to_string(), e.to_string()),
        None => (name_lower.clone(), String::new()),
    };
    if ENTRY_NAMES.contains(&base.as_str()) && ENTRY_EXTS.contains(&ext.as_str()) {
        score += 260;
    }
    const KEYWORDS: &[&str] = &[
        "auth",
        "login",
        "user",
        "project",
        "resume",
        "knowledge",
        "agent",
        "llm",
        "ai",
        "chat",
        "tool",
        "workflow",
        "storage",
        "db",
        "api",
        "route",
        "controller",
        "service",
        "store",
    ];
    if KEYWORDS.iter().any(|k| path_lower.contains(k)) {
        score += 160;
    }
    if file.size > 0 && file.size <= 80_000 {
        score += 30;
    }
    if file.size > 300_000 {
        score -= 200;
    }
    if !is_text_like(file) {
        score -= 1000;
    }
    score
}

fn build_index_summary(index: &ResumeProjectIndex, project: &Project) -> String {
    let mut ext_stats: BTreeMap<String, u32> = BTreeMap::new();
    for f in &index.files {
        let key = f.extension.clone().unwrap_or_else(|| "(no ext)".into());
        *ext_stats.entry(key).or_insert(0) += 1;
    }
    let mut sorted_exts: Vec<_> = ext_stats.into_iter().collect();
    sorted_exts.sort_by(|a, b| b.1.cmp(&a.1));
    let top_ext = sorted_exts
        .iter()
        .take(20)
        .map(|(e, c)| format!("{}:{}", e, c))
        .collect::<Vec<_>>()
        .join(", ");
    let top_dirs = index
        .directories
        .iter()
        .filter(|d| !d.contains('/'))
        .take(80)
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");

    let mut scored: Vec<(i32, &ResumeProjectIndexFile)> = index
        .files
        .iter()
        .filter(|f| is_text_like(f))
        .map(|f| (score_file(f), f))
        .filter(|(s, _)| *s > 0)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.path.cmp(&b.1.path)));
    let candidates = scored
        .iter()
        .take(MAX_CANDIDATE_FILES)
        .map(|(_, f)| format!("{} ({} bytes)", f.path, f.size))
        .collect::<Vec<_>>()
        .join("\n");

    let lines = vec![
        format!("项目名:{}", project.name),
        format!("项目路径:{}", project.path),
        format!(
            "分类:{}",
            if project.tags.is_empty() {
                "未分类".to_string()
            } else {
                project.tags.join(", ")
            }
        ),
        format!(
            "标签:{}",
            if project.labels.is_empty() {
                "无".to_string()
            } else {
                project.labels.join(", ")
            }
        ),
        format!("索引根目录:{}", index.root_name),
        format!(
            "文件数:{}, 目录数:{}, 总字节:{}",
            index.stats.file_count, index.stats.directory_count, index.stats.total_bytes
        ),
        format!(
            "主要扩展名:{}",
            if top_ext.is_empty() {
                "无".to_string()
            } else {
                top_ext
            }
        ),
        String::new(),
        "一级目录:".to_string(),
        if top_dirs.is_empty() {
            "(无)".to_string()
        } else {
            top_dirs
        },
        String::new(),
        "候选关键文件(已由程序基于完整索引筛选,模型只能从这些文件中规划读取):".to_string(),
        if candidates.is_empty() {
            "(无)".to_string()
        } else {
            candidates
        },
    ];
    lines.join("\n")
}

fn normalize_plan(plan: &Value, index: &ResumeProjectIndex) -> Vec<String> {
    let existing: std::collections::HashSet<&str> =
        index.files.iter().map(|f| f.path.as_str()).collect();
    let Some(files) = plan.get("files").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let mut out: Vec<String> = Vec::new();
    for raw in files {
        let Some(s) = raw.as_str() else { continue };
        let path = s
            .replace('\\', "/")
            .trim_start_matches("./")
            .trim_start_matches('/')
            .to_string();
        if path.is_empty()
            || path.contains("..")
            || out.contains(&path)
            || !existing.contains(path.as_str())
        {
            continue;
        }
        out.push(path);
        if out.len() >= MAX_PLAN_FILES {
            break;
        }
    }
    out
}

fn fallback_plan(index: &ResumeProjectIndex) -> Vec<String> {
    let mut scored: Vec<(i32, &ResumeProjectIndexFile)> = index
        .files
        .iter()
        .filter(|f| is_text_like(f))
        .map(|f| (score_file(f), f))
        .filter(|(s, _)| *s > 0)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.path.cmp(&b.1.path)));
    scored
        .iter()
        .take(24.min(MAX_PLAN_FILES))
        .map(|(_, f)| f.path.clone())
        .collect()
}

fn build_file_context(files: &[(String, String)]) -> String {
    let mut total = 0usize;
    let mut chunks: Vec<String> = Vec::new();
    for (path, content) in files {
        let header = format!("\n\n--- FILE: {} ---\n", path);
        let remaining = MAX_CONTEXT_CHARS.saturating_sub(total).saturating_sub(header.chars().count());
        if remaining == 0 {
            break;
        }
        let body: String = if content.chars().count() > remaining {
            let keep = remaining.saturating_sub(80);
            let head: String = content.chars().take(keep).collect();
            format!("{}\n[context truncated]", head)
        } else {
            content.clone()
        };
        total = total + header.chars().count() + body.chars().count();
        chunks.push(format!("{}{}", header, body));
    }
    chunks.join("")
}

// =================== safe_parse_json (port from knowledgeAgent.ts:64-84) ===================
//
// 比 resume_agent.rs 的版本更复杂:LLM 可能返回 ```json fence,先尝试 fence 内容。

fn safe_parse_json(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return Some(v);
    }
    // 尝试 ```json fence
    if let Some(fenced) = extract_code_fence(trimmed) {
        if let Ok(v) = serde_json::from_str::<Value>(fenced.trim()) {
            return Some(v);
        }
    }
    // fallback: 截首末大括号
    let first = trimmed.find('{')?;
    let last = trimmed.rfind('}')?;
    if last < first {
        return None;
    }
    serde_json::from_str(&trimmed[first..=last]).ok()
}

fn extract_code_fence(s: &str) -> Option<&str> {
    let start = s.find("```")?;
    let after = &s[start + 3..];
    let lang_skipped = match after.find('\n') {
        Some(nl) => &after[nl + 1..],
        None => after,
    };
    let end = lang_skipped.find("```")?;
    Some(&lang_skipped[..end])
}

// =================== emit ===================

fn emit_step(
    app: &AppHandle,
    request_id: &str,
    kind: AgentStepKind,
    label: Option<String>,
    detail: Option<String>,
) {
    let event = AgentStepEvent {
        request_id: request_id.to_string(),
        kind,
        label,
        detail,
        ts: Utc::now().timestamp_millis(),
    };
    let _ = app.emit(STEP_EVENT, event);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_file(path: &str, size: u64, ext: Option<&str>) -> ResumeProjectIndexFile {
        ResumeProjectIndexFile {
            path: path.into(),
            size,
            extension: ext.map(String::from),
        }
    }

    #[test]
    fn readme_outranks_random_ts_file() {
        let readme = mk_file("README.md", 4_000, Some("md"));
        let random = mk_file("src/utils/helpers.ts", 4_000, Some("ts"));
        assert!(score_file(&readme) > score_file(&random));
    }

    #[test]
    fn binary_ext_is_excluded() {
        assert!(!is_text_like(&mk_file("a.png", 100, Some("png"))));
        assert!(is_text_like(&mk_file("a.ts", 100, Some("ts"))));
    }

    #[test]
    fn dockerfile_no_ext_is_text_like() {
        assert!(is_text_like(&mk_file("Dockerfile", 100, None)));
        assert!(is_text_like(&mk_file("services/Dockerfile", 100, None)));
        assert!(!is_text_like(&mk_file("services/something", 100, None)));
    }

    #[test]
    fn parse_fenced_json() {
        let raw = "Here is your plan:\n```json\n{\"files\":[\"a.md\"]}\n```\nDone.";
        let v = safe_parse_json(raw).unwrap();
        assert!(v["files"].is_array());
    }

    #[test]
    fn normalize_plan_drops_unknown_and_dedupes() {
        let index = ResumeProjectIndex {
            root_name: "root".into(),
            files: vec![mk_file("a.md", 1, Some("md")), mk_file("b.md", 1, Some("md"))],
            directories: vec![],
            stats: crate::commands::resume::ResumeProjectIndexStats {
                file_count: 2,
                directory_count: 0,
                total_bytes: 2,
            },
        };
        let plan = serde_json::json!({"files":["a.md","a.md","c.md","../etc/passwd","b.md"]});
        let out = normalize_plan(&plan, &index);
        assert_eq!(out, vec!["a.md".to_string(), "b.md".to_string()]);
    }
}
