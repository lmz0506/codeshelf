// 简历生成 agent:在内置虚拟 fs 上跑 LLM 工具循环,产出 ResumeV2。
//
// 取代前端的 resumeAgent.ts (deepagents)。逻辑:
//   1. 初始化虚拟 fs:每份知识库写入 /knowledge/<projectId>.md
//   2. system prompt + user message 启动对话
//   3. while < RECURSION_LIMIT:
//        - chat_completion(messages, builtin_tools)
//        - 没 tool_calls 或 finish_reason == "stop" → break
//        - 执行 tool_calls 更新虚拟 fs,emit step,push 消息
//   4. 从 /resume.json 提取内容,safe_parse,按输入项目顺序组装 ResumeV2
//
// system prompt + JOB_HINTS / TONE_HINTS 完全 port 自 resumeAgent.ts:14-85,保持
// prompt 行为一致(避免 LLM 输出质量回退)。

use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use once_cell::sync::Lazy;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::llm::{chat_completion, pick_model, ChatMessage};
use super::types::{
    AgentStepEvent, AgentStepKind, JobDirection, KnowledgeDoc, ResumeProjectExperience, ResumeV2,
    RunResumeAgentRequest, RunResumeAgentResponse, StarExperience, Tone,
};
use super::virtual_fs::{builtin_tools, execute_builtin_tool, VirtualFile};
use crate::error::{AppError, AppResult};

const RECURSION_LIMIT: u32 = 40;
const STEP_EVENT: &str = "resume-agent-step";

static RESUME_AGENT_ABORTS: Lazy<Arc<RwLock<HashMap<String, AbortHandle>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

#[tauri::command]
#[specta::specta]
pub async fn run_resume_agent(
    app: AppHandle,
    request: RunResumeAgentRequest,
) -> AppResult<RunResumeAgentResponse> {
    if request.knowledge_docs.is_empty() {
        return Err(AppError::invalid("至少需要 1 份项目背景知识"));
    }
    let request_id = request.request_id.clone();
    let app_handle = app.clone();

    let join = tokio::spawn(async move { run_inner(app_handle, request).await });
    let abort = join.abort_handle();
    RESUME_AGENT_ABORTS
        .write()
        .await
        .insert(request_id.clone(), abort);

    let result = join.await;
    RESUME_AGENT_ABORTS.write().await.remove(&request_id);

    match result {
        Ok(inner) => inner,
        Err(e) if e.is_cancelled() => Err(AppError::from("用户已取消")),
        Err(e) => Err(AppError::from(format!("Agent 任务异常退出: {}", e))),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_resume_agent(request_id: String) -> AppResult<()> {
    if let Some(handle) = RESUME_AGENT_ABORTS.write().await.remove(&request_id) {
        handle.abort();
    }
    Ok(())
}

async fn run_inner(
    app: AppHandle,
    request: RunResumeAgentRequest,
) -> AppResult<RunResumeAgentResponse> {
    let request_id = request.request_id.clone();
    let model_config = pick_model(&request.provider)?;
    let model = model_config.model.clone();

    let now_iso = Utc::now().to_rfc3339();
    let mut files: HashMap<String, VirtualFile> = HashMap::new();
    for doc in &request.knowledge_docs {
        let path = format!("/knowledge/{}.md", doc.project_id);
        let ts = if doc.updated_at.trim().is_empty() {
            now_iso.clone()
        } else {
            doc.updated_at.clone()
        };
        files.insert(path, VirtualFile::new_markdown(doc.content.clone(), ts));
    }

    let mut user_lines = vec![format!(
        "请基于虚拟 fs 中 /knowledge/ 目录下的 {} 份项目背景知识,生成简历项目经历。",
        request.knowledge_docs.len()
    )];
    user_lines.push("项目顺序(projectId -> projectName):".to_string());
    for (i, doc) in request.knowledge_docs.iter().enumerate() {
        user_lines.push(format!("  {}. {} -> {}", i + 1, doc.project_id, doc.project_name));
    }
    user_lines.push(String::new());
    user_lines.push("最终请将结果写入 /resume.json。".to_string());
    let user_message = user_lines.join("\n");

    let system_prompt = build_system_prompt(
        request.job_direction,
        &request.jd_keywords,
        request.tone,
    );

    let mut messages = vec![
        ChatMessage::system(system_prompt),
        ChatMessage::user(user_message),
    ];
    let tools = builtin_tools();

    emit_step(&app, &request_id, AgentStepKind::LlmText, Some("启动 Agent".into()), None);

    let mut recursion = 0u32;
    loop {
        if recursion >= RECURSION_LIMIT {
            return Err(AppError::from(format!(
                "Agent 超过 recursion limit ({})",
                RECURSION_LIMIT
            )));
        }
        let resp = chat_completion(&request.provider, &model, &messages, Some(&tools), 0.4).await?;

        if resp.tool_calls.is_empty() || resp.finish_reason == "stop" {
            if !resp.content.is_empty() {
                messages.push(ChatMessage::assistant_with_tool_calls(
                    Some(resp.content),
                    Vec::new(),
                ));
            }
            break;
        }

        let content_for_assistant = if resp.content.is_empty() {
            None
        } else {
            Some(resp.content.clone())
        };
        messages.push(ChatMessage::assistant_with_tool_calls(
            content_for_assistant,
            resp.tool_calls.clone(),
        ));

        let now_ts = Utc::now().to_rfc3339();
        for call in &resp.tool_calls {
            emit_step(
                &app,
                &request_id,
                AgentStepKind::ToolCall,
                Some(call.name.clone()),
                Some(preview(&call.arguments_raw)),
            );
            let result = execute_builtin_tool(&mut files, call, &now_ts);
            emit_step(
                &app,
                &request_id,
                AgentStepKind::ToolResult,
                Some(call.name.clone()),
                Some(preview(&result)),
            );
            messages.push(ChatMessage::tool_result(call.id.clone(), result));
        }
        recursion += 1;
    }

    let raw_json = files
        .get("/resume.json")
        .or_else(|| files.get("resume.json"))
        .map(|f| f.content.clone())
        .ok_or_else(|| AppError::from("Agent 没有产出 resume.json 文件"))?;
    let parsed =
        safe_parse_json(&raw_json).ok_or_else(|| AppError::from("Agent 产出的 resume.json 不是合法 JSON"))?;

    let experiences = build_experiences(&request.knowledge_docs, &parsed);
    let skills = parsed
        .get("skills")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let summary = parsed
        .get("summary")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let now = Utc::now();
    let resume = ResumeV2 {
        id: format!("resume-{}", now.timestamp_micros()),
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
        job_direction: request.job_direction,
        jd_keywords: request.jd_keywords,
        tone: request.tone,
        summary,
        skills,
        experiences,
        is_saved: false,
    };

    Ok(RunResumeAgentResponse { resume })
}

// =================== prompt 构造 (port 自 resumeAgent.ts:14-85) ===================

fn job_hint(d: JobDirection) -> &'static str {
    match d {
        JobDirection::Backend => "突出架构设计、数据库与中间件、API 设计、并发与性能、可观测性、工程化(CI/CD、容器化)",
        JobDirection::Frontend => "突出组件化与设计系统、首屏与运行时性能、用户体验、跨端适配、构建工具与代码规范",
        JobDirection::Fullstack => "突出端到端交付、前后端协同、技术选型、部署链路、DevOps,体现独立负责能力",
    }
}

fn tone_hint(t: Tone) -> &'static str {
    match t {
        Tone::Professional => "正式、专业、用术语;段落完整、句式工整。",
        Tone::Concise => "短句、要点化、信息密度高;可用「;」分隔;避免冗余修饰。",
    }
}

fn job_direction_label(d: JobDirection) -> &'static str {
    match d {
        JobDirection::Backend => "backend",
        JobDirection::Frontend => "frontend",
        JobDirection::Fullstack => "fullstack",
    }
}

fn build_system_prompt(direction: JobDirection, keywords: &[String], tone: Tone) -> String {
    let jd_part = if keywords.is_empty() {
        "## JD 关键词\n(无)".to_string()
    } else {
        format!(
            "## JD 关键词(务必命中至少 50%)\n{}\n\n规则:把命中的关键词显式写在对应项目的 action 字段中(仅当背景知识里真实存在对应技术时才命中,禁止编造)。",
            keywords.join(", ")
        )
    };
    format!(
        r#"你是一名资深技术招聘官,正在为候选人撰写「项目经历」段落。

## 岗位方向
{label}({job_hint})

{jd_part}

## 语气
{tone_hint}

## 工作流程
1. 用 read_file 依次读取虚拟 fs 中所有 `/knowledge/<projectId>.md` 文件,仔细阅读每个项目的背景知识。
2. 为每个项目生成一段符合 STAR 结构的项目经历:
   - **Situation**(项目背景,60-150 字):业务场景、目标用户、解决的问题
   - **Task**(承担任务,60-150 字):在项目中担任的角色、面对的技术挑战
   - **Action**(技术行动,100-200 字):采取的技术方案 / 架构决策 / 关键实现;必须使用背景知识「技术栈详情」中真实出现的术语;优先把 JD 关键词中命中的项显式提及
   - **Result**(项目成果,60-150 字):可见的工程价值(如可维护性、可扩展性、性能、稳定性);只在背景知识 README 中明确出现的量化数字才能引用;**禁止编造** QPS / 响应时间 / 转化率 / 用户量 等具体数字,可以用定性表述
3. 汇总所有项目,提取技能词云(去重,按重要性排序,限 15-20 个)。
4. 用 write_file 把最终结果写入虚拟 fs 的 `/resume.json`,schema 如下:

```json
{{
  "summary": "可选:一句话个人简介(30-80 字)",
  "skills": ["TypeScript", "React", ...],
  "experiences": [
    {{
      "projectId": "<原始项目 id>",
      "projectName": "<原始项目名>",
      "techStack": ["<从背景知识抽取的、与本项目相关的核心技术,5-10 个>"],
      "star": {{
        "situation": "...",
        "task": "...",
        "action": "...",
        "result": "..."
      }}
    }}
  ]
}}
```

## 硬性约束
- 所有内容必须基于背景知识,禁止编造项目细节、人数、时间、指标。
- 不要返回除 `/resume.json` 之外的多余文件。
- 用中文撰写,技术术语保留英文原文。
- experiences 数组顺序与输入项目列表一致。
- 完成后必须确保虚拟 fs 中存在合法 JSON 格式的 /resume.json。
- 不要调用 task 子 Agent;每轮最多调用一个文件工具,避免并行工具调用。
"#,
        label = job_direction_label(direction),
        job_hint = job_hint(direction),
        jd_part = jd_part,
        tone_hint = tone_hint(tone),
    )
}

// =================== 解析 / 组装 ===================

/// 两段式 JSON 解析,复现 resumeAgent.ts:117-129 的兜底逻辑:
/// 1. 严格 JSON.parse;失败则
/// 2. 截取首个 `{` 到末尾 `}` 之间的内容再 parse。
fn safe_parse_json(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return Some(v);
    }
    let first = trimmed.find('{')?;
    let last = trimmed.rfind('}')?;
    if last < first {
        return None;
    }
    serde_json::from_str(&trimmed[first..=last]).ok()
}

/// 按输入 docs 顺序组装 experiences。LLM 产出的 experiences 数组顺序不保证,
/// 用 projectId / projectName 匹配,匹配不到时填空 star,保证返回数组长度一致。
fn build_experiences(docs: &[KnowledgeDoc], parsed: &Value) -> Vec<ResumeProjectExperience> {
    let exps = parsed.get("experiences").and_then(|v| v.as_array());
    docs.iter()
        .map(|doc| {
            let matched = exps.and_then(|arr| {
                arr.iter().find(|e| {
                    e.get("projectId").and_then(|v| v.as_str()) == Some(doc.project_id.as_str())
                        || e.get("projectName").and_then(|v| v.as_str())
                            == Some(doc.project_name.as_str())
                })
            });
            let star_value = matched.and_then(|m| m.get("star"));
            let star_experience = StarExperience {
                situation: star_field(star_value, "situation"),
                task: star_field(star_value, "task"),
                action: star_field(star_value, "action"),
                result: star_field(star_value, "result"),
            };
            let tech_stack = matched
                .and_then(|m| m.get("techStack"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            ResumeProjectExperience {
                project_id: doc.project_id.clone(),
                project_name: doc.project_name.clone(),
                tech_stack,
                star_experience,
                custom_description: None,
                is_edited: false,
            }
        })
        .collect()
}

fn star_field(star: Option<&Value>, name: &str) -> String {
    star.and_then(|s| s.get(name))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// =================== emit / preview ===================

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

fn preview(text: &str) -> String {
    let trimmed = text.trim();
    let total = trimmed.chars().count();
    if total <= 200 {
        trimmed.to_string()
    } else {
        let head: String = trimmed.chars().take(200).collect();
        format!("{}…", head)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_parse_strict_ok() {
        let v = safe_parse_json(r#"{"a": 1}"#).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn safe_parse_with_markdown_fence() {
        let raw = "Here is the JSON you asked for:\n```json\n{\"a\":\"b\"}\n```\nthanks!";
        let v = safe_parse_json(raw).unwrap();
        assert_eq!(v["a"], "b");
    }

    #[test]
    fn safe_parse_unrecoverable_returns_none() {
        assert!(safe_parse_json("no braces here").is_none());
    }

    #[test]
    fn build_experiences_uses_input_order_and_fills_missing() {
        let docs = vec![
            KnowledgeDoc {
                project_id: "p1".into(),
                project_name: "Proj1".into(),
                content: String::new(),
                updated_at: String::new(),
            },
            KnowledgeDoc {
                project_id: "p2".into(),
                project_name: "Proj2".into(),
                content: String::new(),
                updated_at: String::new(),
            },
        ];
        let parsed = serde_json::json!({
            "experiences": [
                {"projectId": "p2", "techStack": ["Rust"], "star": {"situation": "s2", "task": "t2", "action": "a2", "result": "r2"}}
            ]
        });
        let out = build_experiences(&docs, &parsed);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].project_id, "p1");
        assert_eq!(out[0].star_experience.situation, "");
        assert_eq!(out[1].project_id, "p2");
        assert_eq!(out[1].star_experience.situation, "s2");
        assert_eq!(out[1].tech_stack, vec!["Rust".to_string()]);
    }
}
