// OpenAI 兼容的 chat completion 调用层。
//
// 支持 tools (function-calling)、多轮对话、DeepSeek 私有字段关闭 (thinking / parallel_tool_calls)。
// 参考 chat_bridge.rs:111-161 run_llm 的 pattern (同款裸 reqwest + JSON,不引入 SDK)。
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
    pub content: Option<String>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn assistant_with_tool_calls(
        content: Option<String>,
        tool_calls: Vec<ToolCall>,
    ) -> Self {
        Self {
            role: "assistant".into(),
            content,
            tool_calls: Some(tool_calls),
            tool_call_id: None,
        }
    }

    pub fn tool_result(call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: "tool".into(),
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: Some(call_id.into()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// OpenAI 协议把 arguments 序列化成 JSON 字符串 (不是 JSON 值),保留原文,
    /// 工具执行时再 serde_json::from_str 解析。echo 回 messages 时保持字节一致。
    pub arguments_raw: String,
}

#[derive(Debug, Clone)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone)]
pub struct ChatResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    pub finish_reason: String,
}

fn is_deepseek(provider: &AiProviderConfig) -> bool {
    provider.preset_key.as_deref() == Some("deepseek")
        || provider.base_url.to_lowercase().contains("deepseek")
}

fn serialize_messages(messages: &[ChatMessage]) -> Vec<Value> {
    messages
        .iter()
        .map(|m| {
            let mut obj = serde_json::Map::new();
            obj.insert("role".into(), json!(m.role));
            // OpenAI 协议:assistant 含 tool_calls 时 content 不能丢字段。
            // None 写成空串而非 null,兼容更多 provider。
            obj.insert(
                "content".into(),
                m.content
                    .as_ref()
                    .map(|s| json!(s))
                    .unwrap_or_else(|| json!("")),
            );
            if let Some(calls) = &m.tool_calls {
                let arr: Vec<Value> = calls
                    .iter()
                    .map(|c| {
                        json!({
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.name,
                                "arguments": c.arguments_raw,
                            }
                        })
                    })
                    .collect();
                obj.insert("tool_calls".into(), json!(arr));
            }
            if let Some(id) = &m.tool_call_id {
                obj.insert("tool_call_id".into(), json!(id));
            }
            Value::Object(obj)
        })
        .collect()
}

pub async fn chat_completion(
    provider: &AiProviderConfig,
    model: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolDef]>,
    temperature: f32,
) -> AppResult<ChatResponse> {
    let url = format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    );
    let mut body = json!({
        "model": model,
        "messages": serialize_messages(messages),
        "temperature": temperature,
        "stream": false,
        "parallel_tool_calls": false,
    });
    if is_deepseek(provider) {
        body["thinking"] = json!({"type": "disabled"});
    } else {
        body["enable_thinking"] = json!(false);
    }
    if let Some(tools) = tools {
        if !tools.is_empty() {
            let arr: Vec<Value> = tools
                .iter()
                .map(|t| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters,
                        }
                    })
                })
                .collect();
            body["tools"] = json!(arr);
            body["tool_choice"] = json!("auto");
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| AppError::from(format!("创建 HTTP 客户端失败: {}", e)))?;
    let mut req = client.post(&url).json(&body);
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
    let value: Value = resp
        .json()
        .await
        .map_err(|e| AppError::from(format!("解析 LLM JSON 响应失败: {}", e)))?;
    parse_response(&value)
}

fn parse_response(value: &Value) -> AppResult<ChatResponse> {
    let choice = value
        .pointer("/choices/0")
        .ok_or_else(|| AppError::from("LLM 响应缺少 choices[0]"))?;
    let message = choice
        .pointer("/message")
        .ok_or_else(|| AppError::from("LLM 响应缺少 choices[0].message"))?;
    let content = message
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let finish_reason = choice
        .get("finish_reason")
        .and_then(|v| v.as_str())
        .unwrap_or("stop")
        .to_string();
    let tool_calls = parse_tool_calls(message)?;
    Ok(ChatResponse {
        content,
        tool_calls,
        finish_reason,
    })
}

fn parse_tool_calls(message: &Value) -> AppResult<Vec<ToolCall>> {
    let Some(arr) = message.get("tool_calls").and_then(|v| v.as_array()) else {
        return Ok(Vec::new());
    };
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        let id = item
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::from("tool_call 缺少 id"))?
            .to_string();
        let function = item
            .get("function")
            .ok_or_else(|| AppError::from("tool_call 缺少 function"))?;
        let name = function
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::from("tool_call.function 缺少 name"))?
            .to_string();
        let arguments_raw = function
            .get("arguments")
            .and_then(|v| v.as_str())
            .unwrap_or("{}")
            .to_string();
        out.push(ToolCall {
            id,
            name,
            arguments_raw,
        });
    }
    Ok(out)
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
