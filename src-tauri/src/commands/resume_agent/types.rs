// 简历 / 项目知识 agent 的 IPC 数据契约。
// 前端 invoke 时序列化进来,Rust 侧组装后流式 emit step 事件,完成后返回响应。
// 字段命名用 camelCase 跟前端对齐 (`#[serde(rename_all = "camelCase")]`)。

use crate::storage::schema::AiProviderConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobDirection {
    Backend,
    Frontend,
    Fullstack,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    Professional,
    Concise,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StarExperience {
    pub situation: String,
    pub task: String,
    pub action: String,
    pub result: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ResumeProjectExperience {
    pub project_id: String,
    pub project_name: String,
    pub tech_stack: Vec<String>,
    pub star_experience: StarExperience,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_description: Option<String>,
    pub is_edited: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ResumeV2 {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub job_direction: JobDirection,
    pub jd_keywords: Vec<String>,
    pub tone: Tone,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub skills: Vec<String>,
    pub experiences: Vec<ResumeProjectExperience>,
    pub is_saved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDoc {
    pub project_id: String,
    pub project_name: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RunResumeAgentRequest {
    pub request_id: String,
    pub provider: AiProviderConfig,
    pub knowledge_docs: Vec<KnowledgeDoc>,
    pub job_direction: JobDirection,
    pub jd_keywords: Vec<String>,
    pub tone: Tone,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RunResumeAgentResponse {
    pub resume: ResumeV2,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RunKnowledgeAgentRequest {
    pub request_id: String,
    pub provider: AiProviderConfig,
    pub project_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_background: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RunKnowledgeAgentResponse {
    pub background: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStepKind {
    ToolCall,
    ToolResult,
    TodoUpdate,
    LlmText,
    Error,
}

/// Agent 中间步骤事件,通过 IPC event 流式 emit 给前端。
/// 事件通道名:`resume-agent-step` / `knowledge-agent-step`。
/// 前端按 `request_id` 过滤,只显示本次调用的步骤。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepEvent {
    pub request_id: String,
    pub kind: AgentStepKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub ts: i64,
}
