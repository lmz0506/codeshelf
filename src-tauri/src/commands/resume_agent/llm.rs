// OpenAI 兼容的 chat completion 调用层。
//
// 历史:曾经支持 function-calling (tool_calls / ToolDef / ToolCall),为 resume_agent
// 的虚拟 fs 工具循环服务。重构成 structured output 后,resume_agent 不再用工具,
// knowledge_agent 历来也只调 `tools=None` 并只读 content,所以工具相关字段全部移除。
//
// 现在只提供两个能力:
//   - chat_completion       —— 普通 chat,返回 content 字符串
//   - chat_completion_json  —— 带 response_format 的强约束调用,
//                              json_schema → json_object → 裸 prompt 三段 fallback
//
// 不做流式 SSE / retry。取消通过 tokio::spawn + AbortHandle 在调用方实现,
// 本函数不感知 cancel —— 调用 future 被 drop 时 reqwest 会自动放弃 in-flight 请求。

use std::time::Duration;

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::storage::schema::AiProviderConfig;

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
        }
    }
}

fn is_deepseek(provider: &AiProviderConfig) -> bool {
    provider.preset_key.as_deref() == Some("deepseek")
        || provider.base_url.to_lowercase().contains("deepseek")
}

fn serialize_messages(messages: &[ChatMessage]) -> Vec<Value> {
    messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect()
}

fn base_body(provider: &AiProviderConfig, model: &str, messages: &[ChatMessage], temperature: f32) -> Value {
    let mut body = json!({
        "model": model,
        "messages": serialize_messages(messages),
        "temperature": temperature,
        "stream": false,
    });
    if is_deepseek(provider) {
        body["thinking"] = json!({"type": "disabled"});
    } else {
        body["enable_thinking"] = json!(false);
    }
    body
}

pub async fn chat_completion(
    provider: &AiProviderConfig,
    model: &str,
    messages: &[ChatMessage],
    temperature: f32,
) -> AppResult<String> {
    let url = format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    );
    let body = base_body(provider, model, messages, temperature);
    let value = post_chat(provider, &url, body).await?;
    extract_content(&value)
}

/// 用 response_format 强制 LLM 输出严格 JSON。优先 `json_schema`(grammar-constrained
/// decoding,从根本上消除非法 JSON),失败时自动降级到 `json_object`(只保证合法 JSON,
/// schema 由 prompt 描述),再失败则回退到不带 response_format(纯 prompt 约束)。
///
/// 返回原始 content 字符串,由调用方走 serde_json 解析。
pub async fn chat_completion_json(
    provider: &AiProviderConfig,
    model: &str,
    messages: &[ChatMessage],
    schema: Value,
    schema_name: &str,
    temperature: f32,
) -> AppResult<String> {
    let url = format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    );

    let json_schema_format = json!({
        "type": "json_schema",
        "json_schema": {
            "name": schema_name,
            "schema": schema,
            "strict": true,
        }
    });
    match try_json_call(provider, &url, model, messages, temperature, Some(json_schema_format)).await {
        Ok(content) => return Ok(content),
        Err(LlmCallError::BadRequest { .. }) => {
            // provider 不支持 json_schema → 降级到 json_object
        }
        Err(LlmCallError::Other(e)) => return Err(e),
    }

    let json_object_format = json!({"type": "json_object"});
    match try_json_call(provider, &url, model, messages, temperature, Some(json_object_format)).await {
        Ok(content) => return Ok(content),
        Err(LlmCallError::BadRequest { .. }) => {
            // 老 provider 连 json_object 都不支持 → 裸 prompt 兜底
        }
        Err(LlmCallError::Other(e)) => return Err(e),
    }

    try_json_call(provider, &url, model, messages, temperature, None)
        .await
        .map_err(|e| match e {
            LlmCallError::BadRequest { status, body } => {
                AppError::from(format!("LLM 响应 {}: {}", status, body))
            }
            LlmCallError::Other(e) => e,
        })
}

enum LlmCallError {
    BadRequest { status: u16, body: String },
    Other(AppError),
}

async fn try_json_call(
    provider: &AiProviderConfig,
    url: &str,
    model: &str,
    messages: &[ChatMessage],
    temperature: f32,
    response_format: Option<Value>,
) -> Result<String, LlmCallError> {
    let mut body = base_body(provider, model, messages, temperature);
    if let Some(rf) = response_format {
        body["response_format"] = rf;
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| LlmCallError::Other(AppError::from(format!("创建 HTTP 客户端失败: {}", e))))?;
    let mut req = client.post(url).json(&body);
    if let Some(key) = provider.api_key.as_ref() {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            req = req.bearer_auth(trimmed);
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|e| LlmCallError::Other(AppError::from(format!("LLM 请求失败: {}", e))))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        let preview: String = text.chars().take(800).collect();
        // 400 通常代表参数被 provider 拒绝(包括 response_format 不支持);
        // 5xx / 401 / 429 这些是真实运行时错误,直接抛。
        if status.as_u16() == 400 {
            return Err(LlmCallError::BadRequest {
                status: status.as_u16(),
                body: preview,
            });
        }
        return Err(LlmCallError::Other(AppError::from(format!(
            "LLM 响应 {}: {}",
            status, preview
        ))));
    }
    let value: Value = resp
        .json()
        .await
        .map_err(|e| LlmCallError::Other(AppError::from(format!("解析 LLM JSON 响应失败: {}", e))))?;
    extract_content(&value).map_err(LlmCallError::Other)
}

async fn post_chat(
    provider: &AiProviderConfig,
    url: &str,
    body: Value,
) -> AppResult<Value> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| AppError::from(format!("创建 HTTP 客户端失败: {}", e)))?;
    let mut req = client.post(url).json(&body);
    if let Some(key) = provider.api_key.as_ref() {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            req = req.bearer_auth(trimmed);
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|e| AppError::from(format!("LLM 请求失败: {}", e)))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::from(format!(
            "LLM 响应 {}: {}",
            status,
            text.chars().take(800).collect::<String>()
        )));
    }
    resp.json()
        .await
        .map_err(|e| AppError::from(format!("解析 LLM JSON 响应失败: {}", e)))
}

fn extract_content(value: &Value) -> AppResult<String> {
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::from("LLM 响应缺少 choices[0].message.content"))?
        .to_string();
    Ok(content)
}

/// 复用前端 pickModel 的逻辑:优先 `is_default && enabled`,否则第一个 enabled。
pub fn pick_model<'a>(
    provider: &'a AiProviderConfig,
) -> AppResult<&'a crate::storage::schema::AiModelConfig> {
    provider
        .models
        .iter()
        .find(|m| m.is_default && m.enabled)
        .or_else(|| provider.models.iter().find(|m| m.enabled))
        .ok_or_else(|| AppError::invalid("当前 AI 供应商没有可用的模型"))
}
