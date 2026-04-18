//! Eye AI 助手集成
//!
//! Eye (com.eye) 提供 `POST /api/assistant/chat` 接口，返回 {answer, rawResult, ...}。
//! 认证走 Session Cookie：`POST /api/auth/login {username, password}` 获取 Cookie。
//!
//! 本模块把 Eye 封装成 CodeShelf 聊天的一个"供应商"：
//! - 用户在 AI 供应商里建一个 `presetKey = "eye"` 的 provider
//! - `baseUrl` 填 Eye 服务地址（如 http://localhost:8080）
//! - `apiKey` 格式：`username:password`（Eye 是账号密码登录）
//! - 前端发送时走 `chat_eye_query` 命令，不走 OpenAI 流式管线
//!
//! Cookie 以 baseUrl+username 为 key 缓存在内存，失效时会自动重登。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::Mutex;

/// 每个 (baseUrl, username) 对应一个带 cookie 的 client
static CLIENTS: Lazy<Arc<Mutex<HashMap<String, reqwest::Client>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("client 构建失败: {}", e))
}

fn cache_key(base_url: &str, username: &str) -> String {
    format!("{}|{}", base_url.trim_end_matches('/'), username)
}

async fn get_or_create_client(base_url: &str, username: &str) -> Result<reqwest::Client, String> {
    let key = cache_key(base_url, username);
    let mut guard = CLIENTS.lock().await;
    if let Some(c) = guard.get(&key) {
        return Ok(c.clone());
    }
    let c = build_client()?;
    guard.insert(key, c.clone());
    Ok(c)
}

async fn drop_client(base_url: &str, username: &str) {
    let key = cache_key(base_url, username);
    let mut guard = CLIENTS.lock().await;
    guard.remove(&key);
}

async fn login(client: &reqwest::Client, base_url: &str, username: &str, password: &str) -> Result<(), String> {
    let url = format!("{}/api/auth/login", base_url.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .json(&json!({"username": username, "password": password}))
        .send()
        .await
        .map_err(|e| format!("登录请求失败: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Eye 登录失败 {}: {}", status, text.chars().take(300).collect::<String>()));
    }
    Ok(())
}

fn parse_api_key(api_key: &str) -> Result<(String, String), String> {
    let trimmed = api_key.trim();
    let Some(idx) = trimmed.find(':') else {
        return Err("Eye provider 的 apiKey 需填 `username:password` 格式".into());
    };
    let username = trimmed[..idx].trim().to_string();
    let password = trimmed[idx + 1..].to_string();
    if username.is_empty() || password.is_empty() {
        return Err("username 或 password 为空".into());
    }
    Ok((username, password))
}

async fn post_chat(client: &reqwest::Client, base_url: &str, message: &str) -> Result<reqwest::Response, String> {
    let url = format!("{}/api/assistant/chat", base_url.trim_end_matches('/'));
    client
        .post(&url)
        .json(&json!({"message": message}))
        .send()
        .await
        .map_err(|e| format!("chat 请求失败: {}", e))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EyeChatResponse {
    pub answer: String,
    #[serde(default)]
    pub raw: Option<Value>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub provider_name: Option<String>,
    #[serde(default)]
    pub model_name: Option<String>,
}

/// 主入口：发送一条消息到 Eye，返回答案（必要时自动登录）
#[tauri::command]
pub async fn chat_eye_query(base_url: String, api_key: String, message: String) -> Result<EyeChatResponse, String> {
    let (username, password) = parse_api_key(&api_key)?;
    let client = get_or_create_client(&base_url, &username).await?;

    // 首次尝试
    let mut resp = post_chat(&client, &base_url, &message).await?;
    // 未登录 → 登录后重试一次
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED || resp.status() == reqwest::StatusCode::FORBIDDEN {
        login(&client, &base_url, &username, &password).await?;
        resp = post_chat(&client, &base_url, &message).await?;
    }

    if !resp.status().is_success() {
        // 可能是 cookie 过期被缓存了，清掉下次重建
        drop_client(&base_url, &username).await;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Eye {}: {}", status, text.chars().take(500).collect::<String>()));
    }

    let body: Value = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    // Eye 返回 {success, data: {answer, rawResult, mode, providerName, modelName, ...}}
    let data = body.get("data").cloned().unwrap_or(body.clone());
    let answer = data
        .get("answer")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if answer.is_empty() {
        return Err(format!("Eye 未返回 answer：{}", serde_json::to_string(&data).unwrap_or_default()));
    }
    Ok(EyeChatResponse {
        answer,
        raw: data.get("rawResult").cloned(),
        mode: data.get("mode").and_then(|v| v.as_str()).map(String::from),
        provider_name: data.get("providerName").and_then(|v| v.as_str()).map(String::from),
        model_name: data.get("modelName").and_then(|v| v.as_str()).map(String::from),
    })
}

/// 测试连通 + 登录
#[tauri::command]
pub async fn chat_eye_test(base_url: String, api_key: String) -> Result<String, String> {
    let (username, password) = parse_api_key(&api_key)?;
    // 强制新 client，避免旧 cookie 干扰
    drop_client(&base_url, &username).await;
    let client = get_or_create_client(&base_url, &username).await?;
    login(&client, &base_url, &username, &password).await?;
    // 登录成功后试一次 chat
    let resp = post_chat(&client, &base_url, "ping").await?;
    Ok(format!("OK: status={}", resp.status()))
}
