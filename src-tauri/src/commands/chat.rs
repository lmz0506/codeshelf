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
    pub messages: Vec<ChatStreamMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamEvent {
    pub request_id: String,
    pub delta: Option<String>,
    pub done: bool,
    pub error: Option<String>,
    pub thinking_delta: Option<String>,
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
        });
        summaries.push(ChatSessionSummary {
            id: session.id,
            title: session.title,
            provider_id: session.provider_id,
            model_id: session.model_id,
            created_at: session.created_at,
            updated_at: session.updated_at,
            message_count: session.messages.len(),
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
    Ok(())
}

#[tauri::command]
pub async fn chat_cancel(request_id: String) -> Result<(), String> {
    let mut map = CHAT_ABORTS.write().await;
    if let Some(handle) = map.remove(&request_id) {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn chat_stream(app: AppHandle, request: ChatStreamRequest) -> Result<(), String> {
    let request_id = request.request_id.clone();
    let base_url = request.base_url.trim_end_matches('/');
    let url = format!("{}/chat/completions", base_url);

    let client = reqwest::Client::new();
    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(key) = request.api_key.clone() {
        if !key.is_empty() {
            let auth_value = format!("Bearer {}", key);
            headers.insert(
                reqwest::header::AUTHORIZATION,
                auth_value.parse().map_err(|e| format!("无效 API Key: {}", e))?,
            );
        }
    }

    let mut payload = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "stream": true,
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
    if let Some(thinking) = request.thinking {
        payload["thinking"] = serde_json::json!(thinking);
        payload["enable_thinking"] = serde_json::json!(thinking);
        if thinking {
            payload["reasoning"] = serde_json::json!({ "effort": "medium" });
        }
    }

    let body = payload;

    let app_handle = app.clone();
    let handle = tokio::spawn(async move {
        let response = client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await;

        let mut send_error = |err: String| async {
            let _ = app_handle.emit(
                "chat-stream",
                ChatStreamEvent {
                    request_id: request_id.clone(),
                    delta: None,
                    done: true,
                    error: Some(err),
                    thinking_delta: None,
                },
            );
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

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

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
                            let _ = app_handle.emit(
                                "chat-stream",
                                ChatStreamEvent {
                                    request_id: request_id.clone(),
                                    delta: None,
                                    done: true,
                                    error: None,
                                    thinking_delta: None,
                                },
                            );
                            return;
                        }
                        let parsed: serde_json::Value = match serde_json::from_str(data) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        if let Some(delta) = parsed
                            .get("choices")
                            .and_then(|v| v.get(0))
                            .and_then(|v| v.get("delta"))
                            .and_then(|v| v.get("content"))
                            .and_then(|v| v.as_str())
                        {
                            let _ = app_handle.emit(
                                "chat-stream",
                                ChatStreamEvent {
                                    request_id: request_id.clone(),
                                    delta: Some(delta.to_string()),
                                    done: false,
                                    error: None,
                                    thinking_delta: None,
                                },
                            );
                        }
                        if let Some(thinking) = parsed
                            .get("choices")
                            .and_then(|v| v.get(0))
                            .and_then(|v| v.get("delta"))
                            .and_then(|v| v.get("reasoning_content"))
                            .and_then(|v| v.as_str())
                        {
                            let _ = app_handle.emit(
                                "chat-stream",
                                ChatStreamEvent {
                                    request_id: request_id.clone(),
                                    delta: None,
                                    done: false,
                                    error: None,
                                    thinking_delta: Some(thinking.to_string()),
                                },
                            );
                        }
                    }
                }
                Err(err) => {
                    let _ = app_handle.emit(
                        "chat-stream",
                        ChatStreamEvent {
                            request_id: request_id.clone(),
                            delta: None,
                            done: true,
                            error: Some(format!("读取流失败: {}", err)),
                            thinking_delta: None,
                        },
                    );
                    return;
                }
            }
        }
    });

    let abort = handle.abort_handle();
    CHAT_ABORTS.write().await.insert(request.request_id, abort);
    Ok(())
}
