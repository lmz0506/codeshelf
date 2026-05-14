use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use futures::StreamExt;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

use crate::storage::{
    current_iso_time, generate_id, get_storage_config, AppSettings, ChatSession,
    ChatSessionSummary,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamRequest {
    pub request_id: String,
    pub provider_id: String,
    pub model: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub thinking: Option<bool>,
    pub stream: Option<bool>,
    pub messages: Vec<ChatStreamMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<serde_json::Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStreamMessage {
    pub role: String,
    /// string 或 OpenAI 多模态内容数组
    pub content: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "toolCalls")]
    pub tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "toolCallId")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallDelta {
    pub index: u32,
    pub id: Option<String>,
    pub name: Option<String>,
    pub arguments_delta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamEvent {
    pub request_id: String,
    pub delta: Option<String>,
    pub done: bool,
    pub error: Option<String>,
    pub thinking_delta: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_delta: Option<ToolCallDelta>,
    /// 某一轮完成时携带的 finish_reason（"stop" / "tool_calls" 等）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

impl ChatStreamEvent {
    fn new(request_id: &str) -> Self {
        Self {
            request_id: request_id.to_string(),
            delta: None,
            done: false,
            error: None,
            thinking_delta: None,
            tool_call_delta: None,
            finish_reason: None,
        }
    }
}

static CHAT_ABORTS: Lazy<Arc<RwLock<HashMap<String, tokio::task::AbortHandle>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

fn get_default_chat_dir() -> Result<PathBuf, String> {
    let config = get_storage_config()?;
    Ok(config.conversations_dir())
}

fn get_app_settings() -> Result<AppSettings, String> {
    let config = get_storage_config()?;
    let path = config.app_settings_file();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取应用设置失败: {}", e))?;
    let settings: AppSettings = serde_json::from_str(&content).unwrap_or_default();
    Ok(settings)
}

fn resolve_chat_history_dir() -> Result<PathBuf, String> {
    let settings = get_app_settings()?;
    if let Some(dir) = settings.chat_history_dir {
        if dir.trim().is_empty() {
            return get_default_chat_dir();
        }
        return Ok(PathBuf::from(dir));
    }
    get_default_chat_dir()
}

/// 供 tools 模块访问
pub fn resolve_chat_history_dir_pub() -> Result<PathBuf, String> {
    resolve_chat_history_dir()
}

#[tauri::command]
pub async fn get_chat_history_dir() -> Result<String, String> {
    let dir = resolve_chat_history_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn migrate_chat_history_dir(new_dir: String) -> Result<String, String> {
    let new_path = PathBuf::from(new_dir);
    if !new_path.exists() {
        if let Some(parent) = new_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目标目录失败: {}", e))?;
        }
    } else {
        let is_empty = fs::read_dir(&new_path)
            .map_err(|e| format!("读取目标目录失败: {}", e))?
            .next()
            .is_none();

        if !is_empty {
            return Err("目标目录必须为空目录".to_string());
        }

        fs::remove_dir(&new_path)
            .map_err(|e| format!("清理目标目录失败: {}", e))?;
    }

    let old_dir = resolve_chat_history_dir()?;
    if old_dir == new_path {
        return Ok(new_path.to_string_lossy().to_string());
    }

    if !old_dir.exists() {
        return Ok(new_path.to_string_lossy().to_string());
    }

    // 迁移整个目录
    fs::rename(&old_dir, &new_path)
        .map_err(|e| format!("迁移会话目录失败: {}", e))?;

    Ok(new_path.to_string_lossy().to_string())
}

fn ensure_chat_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir)
        .map_err(|e| format!("创建会话目录失败: {}", e))
}

fn session_path(dir: &Path, session_id: &str) -> PathBuf {
    dir.join(format!("{}.json", session_id))
}

#[tauri::command]
pub async fn list_chat_sessions() -> Result<Vec<ChatSessionSummary>, String> {
    let dir = resolve_chat_history_dir()?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut summaries: Vec<ChatSessionSummary> = Vec::new();
    for entry in fs::read_dir(&dir)
        .map_err(|e| format!("读取会话目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取会话文件失败: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("读取会话文件失败: {}", e))?;
        let session: ChatSession = serde_json::from_str(&content).unwrap_or_else(|_| ChatSession {
            id: path.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_string(),
            title: "未命名会话".to_string(),
            provider_id: "".to_string(),
            model_id: "".to_string(),
            created_at: current_iso_time(),
            updated_at: current_iso_time(),
            messages: Vec::new(),
            system_prompt: None,
            temperature: None,
            max_tokens: None,
            top_p: None,
            frequency_penalty: None,
            presence_penalty: None,
            pinned: None,
            allowed_tools: None,
            enabled_tools: None,
            allowed_cwd: None,
            use_mcp_gateway_tools: None,
            current_compaction_version: None,
        });
        summaries.push(ChatSessionSummary {
            id: session.id,
            title: session.title,
            provider_id: session.provider_id,
            model_id: session.model_id,
            created_at: session.created_at,
            updated_at: session.updated_at,
            message_count: session.messages.len(),
            pinned: session.pinned,
        });
    }

    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

#[tauri::command]
pub async fn get_chat_session(session_id: String) -> Result<ChatSession, String> {
    let dir = resolve_chat_history_dir()?;
    let path = session_path(&dir, &session_id);
    if !path.exists() {
        return Err("会话不存在".to_string());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取会话文件失败: {}", e))?;
    let session: ChatSession = serde_json::from_str(&content)
        .map_err(|e| format!("解析会话失败: {}", e))?;
    Ok(session)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatSessionInput {
    pub title: Option<String>,
    pub provider_id: String,
    pub model_id: String,
}

#[tauri::command]
pub async fn create_chat_session(input: CreateChatSessionInput) -> Result<ChatSession, String> {
    let dir = resolve_chat_history_dir()?;
    ensure_chat_dir(&dir)?;

    let now = current_iso_time();
    let session = ChatSession {
        id: generate_id(),
        title: input.title.unwrap_or_else(|| "新会话".to_string()),
        provider_id: input.provider_id,
        model_id: input.model_id,
        created_at: now.clone(),
        updated_at: now,
        messages: Vec::new(),
        system_prompt: None,
        temperature: None,
        max_tokens: None,
        top_p: None,
        frequency_penalty: None,
        presence_penalty: None,
        pinned: None,
        allowed_tools: None,
        enabled_tools: None,
        allowed_cwd: None,
        use_mcp_gateway_tools: None,
        current_compaction_version: None,
    };

    save_chat_session(session.clone()).await?;
    Ok(session)
}

#[tauri::command]
pub async fn save_chat_session(mut session: ChatSession) -> Result<ChatSession, String> {
    let dir = resolve_chat_history_dir()?;
    ensure_chat_dir(&dir)?;
    session.updated_at = current_iso_time();
    let path = session_path(&dir, &session.id);
    let content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("序列化会话失败: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("保存会话失败: {}", e))?;
    Ok(session)
}

#[tauri::command]
pub async fn rename_chat_session(session_id: String, title: String) -> Result<ChatSession, String> {
    let mut session = get_chat_session(session_id).await?;
    session.title = title;
    save_chat_session(session).await
}

#[tauri::command]
pub async fn delete_chat_session(session_id: String) -> Result<(), String> {
    let dir = resolve_chat_history_dir()?;
    let path = session_path(&dir, &session_id);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("删除会话失败: {}", e))?;
    }
    // 同时清理压缩目录（哪怕 json 缺失也尝试删，避免孤儿）
    let compaction_dir = session_compaction_dir(&dir, &session_id);
    if compaction_dir.exists() {
        if let Err(e) = fs::remove_dir_all(&compaction_dir) {
            log::warn!("删除压缩目录失败 {:?}: {}", compaction_dir, e);
        }
    }
    Ok(())
}

// ============== 上下文压缩 ==============

use crate::storage::{CompactionIndex, CompactionMeta};

fn session_compaction_dir(history_dir: &Path, session_id: &str) -> PathBuf {
    history_dir.join(session_id).join("compactions")
}

fn read_compaction_index(dir: &Path) -> CompactionIndex {
    let path = dir.join("index.json");
    if !path.exists() {
        return CompactionIndex::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("读取压缩索引失败 {:?}: {}", path, e);
            return CompactionIndex::default();
        }
    };
    serde_json::from_str(&content).unwrap_or_else(|e| {
        log::warn!("解析压缩索引失败 {:?}: {}", path, e);
        CompactionIndex::default()
    })
}

fn write_compaction_index(dir: &Path, index: &CompactionIndex) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("创建压缩目录失败: {}", e))?;
    let content = serde_json::to_string_pretty(index)
        .map_err(|e| format!("序列化压缩索引失败: {}", e))?;
    fs::write(dir.join("index.json"), content)
        .map_err(|e| format!("写入压缩索引失败: {}", e))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCompactionInput {
    pub session_id: String,
    pub content: String,
    pub source_message_count: usize,
    pub tail_kept: usize,
    pub model: Option<String>,
}

#[tauri::command]
pub async fn save_compaction(input: SaveCompactionInput) -> Result<CompactionMeta, String> {
    if input.content.trim().is_empty() {
        return Err("压缩内容为空".to_string());
    }
    let dir = resolve_chat_history_dir()?;
    let compaction_dir = session_compaction_dir(&dir, &input.session_id);
    fs::create_dir_all(&compaction_dir).map_err(|e| format!("创建压缩目录失败: {}", e))?;

    let mut index = read_compaction_index(&compaction_dir);
    let next_n = index.versions.iter()
        .filter_map(|v| v.version.strip_prefix('v').and_then(|s| s.parse::<u32>().ok()))
        .max()
        .unwrap_or(0)
        + 1;
    let version = format!("v{}", next_n);

    let md_path = compaction_dir.join(format!("{}.md", version));
    fs::write(&md_path, &input.content)
        .map_err(|e| format!("写入压缩文件失败: {}", e))?;

    let meta = CompactionMeta {
        version: version.clone(),
        created_at: current_iso_time(),
        source_message_count: input.source_message_count,
        tail_kept: input.tail_kept,
        char_count: input.content.chars().count(),
        model: input.model,
    };

    index.versions.push(meta.clone());
    index.current = Some(version);
    write_compaction_index(&compaction_dir, &index)?;

    Ok(meta)
}

#[tauri::command]
pub async fn list_compactions(session_id: String) -> Result<CompactionIndex, String> {
    let dir = resolve_chat_history_dir()?;
    let compaction_dir = session_compaction_dir(&dir, &session_id);
    if !compaction_dir.exists() {
        return Ok(CompactionIndex::default());
    }
    Ok(read_compaction_index(&compaction_dir))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionContent {
    pub version: String,
    pub content: String,
    pub meta: Option<CompactionMeta>,
}

#[tauri::command]
pub async fn get_compaction(
    session_id: String,
    version: Option<String>,
) -> Result<Option<CompactionContent>, String> {
    let dir = resolve_chat_history_dir()?;
    let compaction_dir = session_compaction_dir(&dir, &session_id);
    if !compaction_dir.exists() {
        return Ok(None);
    }
    let index = read_compaction_index(&compaction_dir);
    let target = match version.or(index.current.clone()) {
        Some(v) => v,
        None => return Ok(None),
    };
    let md_path = compaction_dir.join(format!("{}.md", target));
    if !md_path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&md_path)
        .map_err(|e| format!("读取压缩文件失败: {}", e))?;
    let meta = index.versions.iter().find(|m| m.version == target).cloned();
    Ok(Some(CompactionContent {
        version: target,
        content,
        meta,
    }))
}

#[tauri::command]
pub async fn chat_cancel(request_id: String) -> Result<(), String> {
    let mut map = CHAT_ABORTS.write().await;
    if let Some(handle) = map.remove(&request_id) {
        handle.abort();
    }
    Ok(())
}

fn build_chat_payload(
    request: &ChatStreamRequest,
    use_stream: bool,
) -> Result<(String, reqwest::header::HeaderMap, serde_json::Value), String> {
    let base_url = request.base_url.trim_end_matches('/');
    let url = format!("{}/chat/completions", base_url);

    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(key) = request.api_key.as_ref() {
        if !key.is_empty() {
            let auth_value = format!("Bearer {}", key);
            headers.insert(
                reqwest::header::AUTHORIZATION,
                auth_value
                    .parse()
                    .map_err(|e| format!("无效 API Key: {}", e))?,
            );
        }
    }

    let filtered_messages: Vec<&ChatStreamMessage> = request
        .messages
        .iter()
        .filter(|m| {
            if m.role != "assistant" {
                return true;
            }
            if m.tool_calls.as_ref().map_or(false, |t| !t.is_empty()) {
                return true;
            }
            match &m.content {
                serde_json::Value::String(s) => !s.trim().is_empty(),
                serde_json::Value::Array(a) => !a.is_empty(),
                _ => true,
            }
        })
        .collect();

    let mut payload = serde_json::json!({
        "model": request.model,
        "messages": filtered_messages,
        "stream": use_stream,
    });

    if let Some(temperature) = request.temperature {
        payload["temperature"] = serde_json::json!(temperature);
    }
    if let Some(max_tokens) = request.max_tokens {
        payload["max_tokens"] = serde_json::json!(max_tokens);
    }
    if let Some(top_p) = request.top_p {
        payload["top_p"] = serde_json::json!(top_p);
    }
    if let Some(frequency_penalty) = request.frequency_penalty {
        payload["frequency_penalty"] = serde_json::json!(frequency_penalty);
    }
    if let Some(presence_penalty) = request.presence_penalty {
        payload["presence_penalty"] = serde_json::json!(presence_penalty);
    }
    if let Some(true) = request.thinking {
        payload["enable_thinking"] = serde_json::json!(true);
        payload["reasoning"] = serde_json::json!({ "effort": "medium" });
    }
    if let Some(tools) = request.tools.as_ref() {
        if !tools.is_empty() {
            payload["tools"] = serde_json::json!(tools);
            if let Some(tc) = request.tool_choice.as_ref() {
                payload["tool_choice"] = tc.clone();
            } else {
                payload["tool_choice"] = serde_json::json!("auto");
            }
        }
    }

    Ok((url, headers, payload))
}

#[tauri::command]
pub async fn chat_complete(request: ChatStreamRequest) -> Result<String, String> {
    let (url, headers, body) = build_chat_payload(&request, false)?;
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }
    let parsed: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    let content = parsed
        .get("choices")
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("message"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "AI 返回无 content".to_string())?
        .to_string();
    Ok(content)
}

#[tauri::command]
pub async fn chat_stream(app: AppHandle, request: ChatStreamRequest) -> Result<(), String> {
    let request_id = request.request_id.clone();
    let use_stream = request.stream.unwrap_or(true);
    let (url, headers, body) = build_chat_payload(&request, use_stream)?;

    let client = reqwest::Client::new();

    let app_handle = app.clone();
    let handle = tokio::spawn(async move {
        let response = client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await;

        let send_error = |err: String| async {
            let mut ev = ChatStreamEvent::new(&request_id);
            ev.done = true;
            ev.error = Some(err);
            let _ = app_handle.emit("chat-stream", ev);
        };

        let response = match response {
            Ok(resp) => resp,
            Err(err) => {
                send_error(format!("请求失败: {}", err)).await;
                return;
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            send_error(format!("HTTP {}: {}", status, text)).await;
            return;
        }

        if !use_stream {
            // 非流式：一次性读取
            let text = match response.text().await {
                Ok(t) => t,
                Err(err) => {
                    send_error(format!("读取响应失败: {}", err)).await;
                    return;
                }
            };
            let parsed: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(err) => {
                    send_error(format!("解析响应失败: {}", err)).await;
                    return;
                }
            };
            let choice0 = parsed.get("choices").and_then(|v| v.get(0));
            let message = choice0.and_then(|v| v.get("message"));
            let content = message
                .and_then(|v| v.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let reasoning = message
                .and_then(|v| v.get("reasoning_content"))
                .and_then(|v| v.as_str());
            let tool_calls = message.and_then(|v| v.get("tool_calls")).and_then(|v| v.as_array());
            let finish_reason = choice0
                .and_then(|v| v.get("finish_reason"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if let Some(r) = reasoning {
                let mut ev = ChatStreamEvent::new(&request_id);
                ev.thinking_delta = Some(r.to_string());
                let _ = app_handle.emit("chat-stream", ev);
            }
            if !content.is_empty() {
                let mut ev = ChatStreamEvent::new(&request_id);
                ev.delta = Some(content.to_string());
                let _ = app_handle.emit("chat-stream", ev);
            }
            if let Some(calls) = tool_calls {
                for (idx, call) in calls.iter().enumerate() {
                    let id = call.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let func = call.get("function");
                    let name = func
                        .and_then(|v| v.get("name"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let args = func
                        .and_then(|v| v.get("arguments"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let mut ev = ChatStreamEvent::new(&request_id);
                    ev.tool_call_delta = Some(ToolCallDelta {
                        index: idx as u32,
                        id,
                        name,
                        arguments_delta: args,
                    });
                    let _ = app_handle.emit("chat-stream", ev);
                }
            }
            let mut ev = ChatStreamEvent::new(&request_id);
            ev.done = true;
            ev.finish_reason = finish_reason;
            let _ = app_handle.emit("chat-stream", ev);
            return;
        }

        // 流式
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut last_finish: Option<String> = None;

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    let part = String::from_utf8_lossy(&bytes);
                    buffer.push_str(&part);
                    while let Some(pos) = buffer.find("\n") {
                        let line = buffer[..pos].trim().to_string();
                        buffer = buffer[pos + 1..].to_string();
                        if line.is_empty() || !line.starts_with("data:") {
                            continue;
                        }
                        let data = line.trim_start_matches("data:").trim();
                        if data == "[DONE]" {
                            let mut ev = ChatStreamEvent::new(&request_id);
                            ev.done = true;
                            ev.finish_reason = last_finish.clone();
                            let _ = app_handle.emit("chat-stream", ev);
                            return;
                        }
                        let parsed: serde_json::Value = match serde_json::from_str(data) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        let choice0 = parsed.get("choices").and_then(|v| v.get(0));
                        let delta = choice0.and_then(|v| v.get("delta"));

                        if let Some(fr) = choice0
                            .and_then(|v| v.get("finish_reason"))
                            .and_then(|v| v.as_str())
                        {
                            last_finish = Some(fr.to_string());
                        }

                        if let Some(content) = delta
                            .and_then(|v| v.get("content"))
                            .and_then(|v| v.as_str())
                        {
                            let mut ev = ChatStreamEvent::new(&request_id);
                            ev.delta = Some(content.to_string());
                            let _ = app_handle.emit("chat-stream", ev);
                        }
                        if let Some(thinking) = delta
                            .and_then(|v| v.get("reasoning_content"))
                            .and_then(|v| v.as_str())
                        {
                            let mut ev = ChatStreamEvent::new(&request_id);
                            ev.thinking_delta = Some(thinking.to_string());
                            let _ = app_handle.emit("chat-stream", ev);
                        }
                        if let Some(tool_calls) = delta
                            .and_then(|v| v.get("tool_calls"))
                            .and_then(|v| v.as_array())
                        {
                            for call in tool_calls {
                                let index = call
                                    .get("index")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0) as u32;
                                let id = call.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                                let func = call.get("function");
                                let name = func
                                    .and_then(|v| v.get("name"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                let args = func
                                    .and_then(|v| v.get("arguments"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                if id.is_none() && name.is_none() && args.is_none() {
                                    continue;
                                }
                                let mut ev = ChatStreamEvent::new(&request_id);
                                ev.tool_call_delta = Some(ToolCallDelta {
                                    index,
                                    id,
                                    name,
                                    arguments_delta: args,
                                });
                                let _ = app_handle.emit("chat-stream", ev);
                            }
                        }
                    }
                }
                Err(err) => {
                    let mut ev = ChatStreamEvent::new(&request_id);
                    ev.done = true;
                    ev.error = Some(format!("读取流失败: {}", err));
                    let _ = app_handle.emit("chat-stream", ev);
                    return;
                }
            }
        }
    });

    let abort = handle.abort_handle();
    CHAT_ABORTS.write().await.insert(request.request_id, abort);
    Ok(())
}
