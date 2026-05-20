// 简历生成 agent:把所有背景知识 inline 进 user message,单次调用 LLM,
// 用 response_format=json_schema 强制 grammar-constrained decoding 产出严格 JSON。
//
// 设计取舍:历史版本走"虚拟 fs + write_file 工具"循环,本质上是把模型当 IO 设备使。
// 模型输出走 tool_call.arguments 的字符串字段,既要双重转义又没有 schema 约束,
// 频繁出现非法 JSON / 截断。改成 structured output 后,JSON 合法性由 provider 在
// 解码阶段强制保证,不再需要 safe_parse 兜底,也不再需要 agent loop 反复读已经
// 注入到上下文的文本。
//
// fallback 链由 chat_completion_json 内部处理:json_schema → json_object → 无约束。

use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::llm::{chat_completion_json, pick_model, ChatMessage};
use super::types::{
    AgentStepEvent, AgentStepKind, JobDirection, KnowledgeDoc, ResumeProjectExperience, ResumeV2,
    RunResumeAgentRequest, RunResumeAgentResponse, StarExperience, Tone,
};
use crate::error::{AppError, AppResult};

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

    emit_step(
        &app,
        &request_id,
        AgentStepKind::LlmText,
        Some("整理背景知识".into()),
        Some(format!("{} 份项目", request.knowledge_docs.len())),
    );

    let system_prompt = build_system_prompt(
        request.job_direction,
        &request.jd_keywords,
        request.tone,
    );
    let user_message = build_user_message(&request);
    let messages = vec![
        ChatMessage::system(system_prompt),
        ChatMessage::user(user_message),
    ];

    emit_step(
        &app,
        &request_id,
        AgentStepKind::LlmText,
        Some("调用 LLM 生成简历".into()),
        Some(model.clone()),
    );

    let content = chat_completion_json(
        &request.provider,
        &model,
        &messages,
        resume_json_schema(),
        "ResumeOutput",
        0.4,
    )
    .await?;

    emit_step(
        &app,
        &request_id,
        AgentStepKind::LlmText,
        Some("解析模型输出".into()),
        Some(format!("{} 字符", content.chars().count())),
    );

    let parsed: ResumeOutput = serde_json::from_str(&content).map_err(|e| {
        let preview: String = content.chars().take(400).collect();
        AppError::from(format!(
            "解析模型 JSON 失败: {} (前 400 字符: {})",
            e, preview
        ))
    })?;

    let experiences = build_experiences(&request.knowledge_docs, &parsed);
    let skills: Vec<String> = parsed
        .skills
        .into_iter()
        .filter_map(|s| {
            let t = s.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        })
        .collect();
    let summary = parsed
        .summary
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

// =================== prompt 构造 ===================

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

## 任务
为用户消息中的每个项目生成一段符合 STAR 结构的项目经历,并汇总技能词云。

## STAR 字段要求
- **situation**(项目背景,60-150 字):业务场景、目标用户、解决的问题
- **task**(承担任务,60-150 字):在项目中担任的角色、面对的技术挑战
- **action**(技术行动,100-200 字):采取的技术方案 / 架构决策 / 关键实现;必须使用背景知识「技术栈详情」中真实出现的术语;优先把 JD 关键词中命中的项显式提及
- **result**(项目成果,60-150 字):可见的工程价值(如可维护性、可扩展性、性能、稳定性);只在背景知识 README 中明确出现的量化数字才能引用;**禁止编造** QPS / 响应时间 / 转化率 / 用户量 等具体数字,可以用定性表述

## techStack
从背景知识抽取与本项目相关的核心技术,5-10 个。

## skills(全局技能词云)
去重,按重要性排序,15-20 个。

## 硬性约束
- 所有内容必须基于背景知识,禁止编造项目细节、人数、时间、指标。
- 用中文撰写,技术术语保留英文原文。
- experiences 数组顺序与用户消息中的项目列表一致。
- projectId / projectName 必须原样拷贝,不要改写。
- 输出严格按 schema 返回 JSON,不要附加任何说明文字。
"#,
        label = job_direction_label(direction),
        job_hint = job_hint(direction),
        jd_part = jd_part,
        tone_hint = tone_hint(tone),
    )
}

fn build_user_message(request: &RunResumeAgentRequest) -> String {
    let mut s = String::new();
    s.push_str(&format!(
        "请基于以下 {} 份项目背景知识,生成简历项目经历。\n\n",
        request.knowledge_docs.len()
    ));

    s.push_str("## 项目顺序 (实际 experiences 数组必须按此顺序)\n");
    for (i, d) in request.knowledge_docs.iter().enumerate() {
        s.push_str(&format!(
            "{}. projectId={} projectName={}\n",
            i + 1,
            d.project_id,
            d.project_name
        ));
    }
    s.push_str("\n## 背景知识全文\n");
    for d in &request.knowledge_docs {
        s.push_str(&format!(
            "\n---\n### 项目: {} (projectId={})\n\n",
            d.project_name, d.project_id
        ));
        s.push_str(d.content.trim());
        s.push('\n');
    }
    s
}

// =================== schema ===================

fn resume_json_schema() -> Value {
    // OpenAI strict json_schema 要求每个 object 都 additionalProperties:false,
    // 且所有 properties 必须在 required 里(没有"可选"概念,用空串代替)。
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["summary", "skills", "experiences"],
        "properties": {
            "summary": {
                "type": "string",
                "description": "一句话个人简介(30-80 字),没有时返回空串"
            },
            "skills": {
                "type": "array",
                "description": "全局技能词云,去重,15-20 个",
                "items": { "type": "string" }
            },
            "experiences": {
                "type": "array",
                "description": "项目经历数组,顺序必须与 user message 中的项目列表一致",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["projectId", "projectName", "techStack", "star"],
                    "properties": {
                        "projectId": { "type": "string" },
                        "projectName": { "type": "string" },
                        "techStack": {
                            "type": "array",
                            "items": { "type": "string" }
                        },
                        "star": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["situation", "task", "action", "result"],
                            "properties": {
                                "situation": { "type": "string" },
                                "task": { "type": "string" },
                                "action": { "type": "string" },
                                "result": { "type": "string" }
                            }
                        }
                    }
                }
            }
        }
    })
}

// =================== 模型输出 typed view ===================

#[derive(Debug, Deserialize)]
struct ResumeOutput {
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    skills: Vec<String>,
    #[serde(default)]
    experiences: Vec<ResumeOutputExp>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResumeOutputExp {
    #[serde(default)]
    project_id: String,
    #[serde(default)]
    project_name: String,
    #[serde(default)]
    tech_stack: Vec<String>,
    #[serde(default)]
    star: Option<ResumeOutputStar>,
}

#[derive(Debug, Deserialize)]
struct ResumeOutputStar {
    #[serde(default)]
    situation: String,
    #[serde(default)]
    task: String,
    #[serde(default)]
    action: String,
    #[serde(default)]
    result: String,
}

// =================== 组装 ===================

/// 按输入 docs 顺序组装 experiences。即使 LLM 顺序错乱或某项匹配不到,
/// 也保证返回数组长度 = docs 数,缺失字段填空串,UI 侧能正常渲染并提示手动编辑。
fn build_experiences(docs: &[KnowledgeDoc], parsed: &ResumeOutput) -> Vec<ResumeProjectExperience> {
    docs.iter()
        .map(|doc| {
            let matched = parsed.experiences.iter().find(|e| {
                e.project_id == doc.project_id || e.project_name == doc.project_name
            });
            let star = matched
                .and_then(|m| m.star.as_ref())
                .map(|s| StarExperience {
                    situation: s.situation.clone(),
                    task: s.task.clone(),
                    action: s.action.clone(),
                    result: s.result.clone(),
                })
                .unwrap_or_else(|| StarExperience {
                    situation: String::new(),
                    task: String::new(),
                    action: String::new(),
                    result: String::new(),
                });
            let tech_stack = matched
                .map(|m| m.tech_stack.clone())
                .unwrap_or_default();
            ResumeProjectExperience {
                project_id: doc.project_id.clone(),
                project_name: doc.project_name.clone(),
                tech_stack,
                star_experience: star,
                custom_description: None,
                is_edited: false,
            }
        })
        .collect()
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
