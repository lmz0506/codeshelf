//! ApiChat：通用 API 对话功能
//!
//! - 接口库：用户维护若干 Group（共享 BaseUrl + 鉴权）与 Endpoint（method/url/params_schema）。
//! - 对话会话：绑定多个 Endpoint；用户自然语言 → LLM via OpenAI Function Calling 挑接口 → 后端执行 HTTP → tool 消息回注。
//! - 鉴权：None / Bearer / Basic / ApiKey(header) / Session(登录拿 cookie 或 token)。
//!
//! 存储：
//!   - data_dir/api_groups.json   (Vec<ApiGroup>)
//!   - data_dir/api_endpoints.json (Vec<ApiEndpoint>)
//!   - data_dir/api_chat_sessions/<id>.json  (ApiChatSession)

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::storage::{
    current_iso_time, generate_id, get_storage_config, ApiAuthConfig, ApiChatSession,
    ApiChatSessionSummary, ApiEndpoint, ApiGroup, SessionInject,
};

const DEFAULT_RESPONSE_TRIM_BYTES: usize = 8192;

// ============== 路径 / IO 辅助 ==============

fn groups_file() -> Result<PathBuf, String> {
    Ok(get_storage_config()?.api_groups_file())
}

fn endpoints_file() -> Result<PathBuf, String> {
    Ok(get_storage_config()?.api_endpoints_file())
}

fn sessions_dir() -> Result<PathBuf, String> {
    Ok(get_storage_config()?.api_chat_sessions_dir())
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(())
}

fn load_groups() -> Result<Vec<ApiGroup>, String> {
    let path = groups_file()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取 groups 失败: {}", e))?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&content).map_err(|e| format!("解析 groups 失败: {}", e))
}

fn write_groups(groups: &[ApiGroup]) -> Result<(), String> {
    let path = groups_file()?;
    ensure_parent(&path)?;
    let content =
        serde_json::to_string_pretty(groups).map_err(|e| format!("序列化 groups 失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("保存 groups 失败: {}", e))
}

fn load_endpoints() -> Result<Vec<ApiEndpoint>, String> {
    let path = endpoints_file()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("读取 endpoints 失败: {}", e))?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&content).map_err(|e| format!("解析 endpoints 失败: {}", e))
}

fn write_endpoints(endpoints: &[ApiEndpoint]) -> Result<(), String> {
    let path = endpoints_file()?;
    ensure_parent(&path)?;
    let content = serde_json::to_string_pretty(endpoints)
        .map_err(|e| format!("序列化 endpoints 失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("保存 endpoints 失败: {}", e))
}

fn session_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.json", id))
}

// ============== Group CRUD ==============

#[tauri::command]
pub async fn list_api_groups() -> Result<Vec<ApiGroup>, String> {
    let mut groups = load_groups()?;
    groups.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(groups)
}

#[tauri::command]
pub async fn save_api_group(mut group: ApiGroup) -> Result<ApiGroup, String> {
    let mut groups = load_groups()?;
    let now = current_iso_time();
    if group.id.trim().is_empty() {
        group.id = generate_id();
        group.created_at = now.clone();
    }
    group.updated_at = now;

    if let Some(idx) = groups.iter().position(|g| g.id == group.id) {
        if group.created_at.trim().is_empty() {
            group.created_at = groups[idx].created_at.clone();
        }
        groups[idx] = group.clone();
    } else {
        if group.created_at.trim().is_empty() {
            group.created_at = group.updated_at.clone();
        }
        groups.push(group.clone());
    }
    write_groups(&groups)?;
    // Session 鉴权变更时，清掉对应 client 强制重登
    drop_session_client(&group.id).await;
    Ok(group)
}

#[tauri::command]
pub async fn delete_api_group(id: String) -> Result<(), String> {
    let mut groups = load_groups()?;
    groups.retain(|g| g.id != id);
    write_groups(&groups)?;

    // 级联：把组下接口的 group_id 置空（保留接口）
    let mut endpoints = load_endpoints()?;
    let mut dirty = false;
    for ep in endpoints.iter_mut() {
        if ep.group_id.as_deref() == Some(&id) {
            ep.group_id = None;
            ep.updated_at = current_iso_time();
            dirty = true;
        }
    }
    if dirty {
        write_endpoints(&endpoints)?;
    }
    drop_session_client(&id).await;
    Ok(())
}

// ============== Endpoint CRUD ==============

#[tauri::command]
pub async fn list_api_endpoints() -> Result<Vec<ApiEndpoint>, String> {
    let mut endpoints = load_endpoints()?;
    endpoints.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(endpoints)
}

#[tauri::command]
pub async fn save_api_endpoint(mut endpoint: ApiEndpoint) -> Result<ApiEndpoint, String> {
    let mut endpoints = load_endpoints()?;
    let now = current_iso_time();
    if endpoint.id.trim().is_empty() {
        endpoint.id = generate_id();
        endpoint.created_at = now.clone();
    }
    endpoint.updated_at = now;

    if let Some(idx) = endpoints.iter().position(|e| e.id == endpoint.id) {
        if endpoint.created_at.trim().is_empty() {
            endpoint.created_at = endpoints[idx].created_at.clone();
        }
        endpoints[idx] = endpoint.clone();
    } else {
        if endpoint.created_at.trim().is_empty() {
            endpoint.created_at = endpoint.updated_at.clone();
        }
        endpoints.push(endpoint.clone());
    }
    write_endpoints(&endpoints)?;
    Ok(endpoint)
}

#[tauri::command]
pub async fn delete_api_endpoint(id: String) -> Result<(), String> {
    let mut endpoints = load_endpoints()?;
    endpoints.retain(|e| e.id != id);
    write_endpoints(&endpoints)
}

// ============== Session CRUD ==============

#[tauri::command]
pub async fn list_api_chat_sessions() -> Result<Vec<ApiChatSessionSummary>, String> {
    let dir = sessions_dir()?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<ApiChatSessionSummary> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("读取会话目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取会话文件失败: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("读取会话失败: {}", e))?;
        let session: ApiChatSession = match serde_json::from_str(&content) {
            Ok(s) => s,
            Err(_) => continue,
        };
        out.push(ApiChatSessionSummary {
            id: session.id,
            title: session.title,
            provider_id: session.provider_id,
            model_id: session.model_id,
            created_at: session.created_at,
            updated_at: session.updated_at,
            message_count: session.messages.len(),
            endpoint_count: session.selected_endpoint_ids.len(),
            pinned: session.pinned,
        });
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
pub async fn get_api_chat_session(session_id: String) -> Result<ApiChatSession, String> {
    let dir = sessions_dir()?;
    let path = session_path(&dir, &session_id);
    if !path.exists() {
        return Err("会话不存在".into());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取会话失败: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("解析会话失败: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiChatSessionInput {
    pub title: Option<String>,
    pub provider_id: String,
    pub model_id: String,
    #[serde(default)]
    pub selected_endpoint_ids: Vec<String>,
}

#[tauri::command]
pub async fn create_api_chat_session(
    input: CreateApiChatSessionInput,
) -> Result<ApiChatSession, String> {
    let dir = sessions_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    let now = current_iso_time();
    let session = ApiChatSession {
        id: generate_id(),
        title: input.title.unwrap_or_else(|| "新接口对话".to_string()),
        provider_id: input.provider_id,
        model_id: input.model_id,
        created_at: now.clone(),
        updated_at: now,
        messages: Vec::new(),
        selected_endpoint_ids: input.selected_endpoint_ids,
        system_prompt: None,
        temperature: None,
        max_tokens: None,
        top_p: None,
        frequency_penalty: None,
        presence_penalty: None,
        pinned: None,
    };
    save_api_chat_session(session.clone()).await?;
    Ok(session)
}

#[tauri::command]
pub async fn save_api_chat_session(
    mut session: ApiChatSession,
) -> Result<ApiChatSession, String> {
    let dir = sessions_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    session.updated_at = current_iso_time();
    let path = session_path(&dir, &session.id);
    let content =
        serde_json::to_string_pretty(&session).map_err(|e| format!("序列化会话失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("保存会话失败: {}", e))?;
    Ok(session)
}

#[tauri::command]
pub async fn rename_api_chat_session(
    session_id: String,
    title: String,
) -> Result<ApiChatSession, String> {
    let mut session = get_api_chat_session(session_id).await?;
    session.title = title;
    save_api_chat_session(session).await
}

#[tauri::command]
pub async fn delete_api_chat_session(session_id: String) -> Result<(), String> {
    let dir = sessions_dir()?;
    let path = session_path(&dir, &session_id);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("删除会话失败: {}", e))?;
    }
    Ok(())
}

// ============== LLM 衔接 ==============

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiToolsBundle {
    /// OpenAI function tools 数组
    pub tools: Vec<Value>,
    /// tool_name -> endpoint_id
    pub tool_name_map: HashMap<String, String>,
}

/// 将 endpoint_id slugify 成 OpenAI function name（^[a-zA-Z0-9_-]{1,64}$）
fn sanitize_tool_name(endpoint_id: &str) -> String {
    let raw = format!("ep_{}", endpoint_id);
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.len() <= 60 {
        cleaned
    } else {
        cleaned.chars().take(60).collect()
    }
}

#[tauri::command]
pub async fn build_api_tools(endpoint_ids: Vec<String>) -> Result<ApiToolsBundle, String> {
    let all = load_endpoints()?;
    let by_id: HashMap<String, ApiEndpoint> =
        all.into_iter().map(|e| (e.id.clone(), e)).collect();

    let mut tools: Vec<Value> = Vec::new();
    let mut map: HashMap<String, String> = HashMap::new();

    for eid in endpoint_ids {
        let Some(endpoint) = by_id.get(&eid) else {
            continue;
        };
        let tool_name = sanitize_tool_name(&endpoint.id);
        // 避免重名
        if map.contains_key(&tool_name) {
            continue;
        }
        let desc = endpoint
            .description
            .clone()
            .unwrap_or_else(|| format!("{} {}", endpoint.method, endpoint.url));
        let desc = format!(
            "{}\n(method: {}, url: {})",
            desc, endpoint.method, endpoint.url
        );
        // 参数 schema：允许为空对象
        let parameters = if endpoint.params_schema.is_null() {
            json!({ "type": "object", "properties": {} })
        } else {
            endpoint.params_schema.clone()
        };
        tools.push(json!({
            "type": "function",
            "function": {
                "name": tool_name,
                "description": desc,
                "parameters": parameters,
            }
        }));
        map.insert(tool_name, endpoint.id.clone());
    }

    Ok(ApiToolsBundle {
        tools,
        tool_name_map: map,
    })
}

// ============== HTTP 执行 ==============

/// Session 鉴权用的 reqwest::Client + 可选缓存 token（header 模式下）
#[derive(Clone)]
struct SessionClient {
    client: reqwest::Client,
    /// header 注入模式下，登录后抽取的 token
    token: Option<String>,
}

static SESSION_CLIENTS: Lazy<Arc<Mutex<HashMap<String, SessionClient>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

async fn drop_session_client(group_id: &str) {
    let mut guard = SESSION_CLIENTS.lock().await;
    guard.remove(group_id);
}

fn build_session_base_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("构建 client 失败: {}", e))
}

fn join_url(base: &str, path: &str) -> String {
    if path.starts_with("http://") || path.starts_with("https://") {
        return path.to_string();
    }
    let base = base.trim_end_matches('/');
    if path.starts_with('/') {
        format!("{}{}", base, path)
    } else if base.is_empty() {
        path.to_string()
    } else {
        format!("{}/{}", base, path)
    }
}

/// 从响应 JSON 按 path（如 "data.token"）抽值
fn extract_json_path(v: &Value, path: &str) -> Option<String> {
    let mut current = v;
    for part in path.split('.').filter(|p| !p.is_empty()) {
        if let Some(next) = current.get(part) {
            current = next;
        } else {
            return None;
        }
    }
    match current {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// 替换 URL 里的 {path_param}
fn substitute_path_params(url: &str, params: &HashMap<String, Value>) -> String {
    let mut out = String::with_capacity(url.len());
    let bytes = url.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' {
            if let Some(j) = url[i + 1..].find('}') {
                let key = &url[i + 1..i + 1 + j];
                if let Some(v) = params.get(key) {
                    let s = match v {
                        Value::String(s) => s.clone(),
                        other => other.to_string().trim_matches('"').to_string(),
                    };
                    out.push_str(&s);
                    i = i + 1 + j + 1;
                    continue;
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

/// 约定：arguments 顶层字段 `_body`/`_query`/`_path` 显式分区；若无则按 method 默认分派
fn split_arguments(
    args: &Value,
    method: &str,
) -> (
    HashMap<String, Value>,
    HashMap<String, Value>,
    Option<Value>,
) {
    let empty = serde_json::Map::new();
    let obj = args.as_object().unwrap_or(&empty);
    let mut path_map: HashMap<String, Value> = HashMap::new();
    let mut query_map: HashMap<String, Value> = HashMap::new();
    let mut body: Option<Value> = None;

    let has_partitioned = obj.contains_key("_body")
        || obj.contains_key("_query")
        || obj.contains_key("_path");

    if has_partitioned {
        if let Some(Value::Object(m)) = obj.get("_path") {
            for (k, v) in m {
                path_map.insert(k.clone(), v.clone());
            }
        }
        if let Some(Value::Object(m)) = obj.get("_query") {
            for (k, v) in m {
                query_map.insert(k.clone(), v.clone());
            }
        }
        if let Some(b) = obj.get("_body") {
            body = Some(b.clone());
        }
    } else {
        let method_upper = method.to_uppercase();
        let is_body_method = matches!(method_upper.as_str(), "POST" | "PUT" | "PATCH" | "DELETE");
        if is_body_method {
            body = Some(args.clone());
        } else {
            for (k, v) in obj {
                query_map.insert(k.clone(), v.clone());
            }
        }
    }

    // path 占位参数优先从 path_map 取；若用户没显式分区，我们从 query/body 里挪一遍（best-effort）。
    if !has_partitioned {
        // 让 substitute_path_params 有机会从 query/body 中匹配
        // 统一暴露给调用处：把所有候选 map 合并成 path_map 备用
    }

    (path_map, query_map, body)
}

fn value_to_query_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::Null => "".to_string(),
        _ => v.to_string(),
    }
}

fn trim_response(bytes: &[u8], max_bytes: usize) -> String {
    if bytes.len() <= max_bytes {
        match std::str::from_utf8(bytes) {
            Ok(s) => s.to_string(),
            Err(_) => {
                let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
                format!("<binary {} bytes; base64>\n{}", bytes.len(), b64)
            }
        }
    } else {
        match std::str::from_utf8(&bytes[..max_bytes]) {
            Ok(s) => format!("{}\n…（已截断 {}/{} bytes）", s, max_bytes, bytes.len()),
            Err(_) => {
                let b64 =
                    base64::engine::general_purpose::STANDARD.encode(&bytes[..max_bytes]);
                format!(
                    "<binary {} bytes truncated to {}; base64>\n{}",
                    bytes.len(),
                    max_bytes,
                    b64
                )
            }
        }
    }
}

/// 为请求注入鉴权
/// 返回 (最终用的 client, 最终 builder)
/// 注意：Session 类型依赖有 cookie_store 的 client；其他类型用普通 client
async fn apply_auth(
    group_id_for_session_cache: Option<&str>,
    auth: &ApiAuthConfig,
    base_url_for_relative_login: &str,
    mut builder: reqwest::RequestBuilder,
    client_for_others: &reqwest::Client,
) -> Result<(reqwest::Client, reqwest::RequestBuilder), String> {
    match auth {
        ApiAuthConfig::None => Ok((client_for_others.clone(), builder)),
        ApiAuthConfig::Bearer { token } => {
            builder = builder.header("Authorization", format!("Bearer {}", token));
            Ok((client_for_others.clone(), builder))
        }
        ApiAuthConfig::Basic { username, password } => {
            builder = builder.basic_auth(username, Some(password));
            Ok((client_for_others.clone(), builder))
        }
        ApiAuthConfig::ApiKey { header, value } => {
            builder = builder.header(header, value);
            Ok((client_for_others.clone(), builder))
        }
        ApiAuthConfig::Session {
            login_url,
            login_method,
            credentials_json,
            token_json_path,
            inject_as,
        } => {
            let cache_key = group_id_for_session_cache
                .unwrap_or("__endpoint_override__")
                .to_string();

            // 获取/创建 SessionClient
            let session = {
                let mut guard = SESSION_CLIENTS.lock().await;
                if let Some(s) = guard.get(&cache_key) {
                    s.clone()
                } else {
                    let new_client = build_session_base_client()?;
                    let s = SessionClient {
                        client: new_client,
                        token: None,
                    };
                    guard.insert(cache_key.clone(), s.clone());
                    s
                }
            };

            // 如果已有 token（header 模式），就注入
            let session_with_token = ensure_session_login(
                &cache_key,
                &session,
                base_url_for_relative_login,
                login_url,
                login_method,
                credentials_json,
                token_json_path.as_deref(),
                inject_as,
            )
            .await?;

            // 用 session 的 client 重建 builder（因为原 builder 绑定到 client_for_others）
            // 这里让调用方知道要重建——返回 session.client，调用方再接着构建。
            match inject_as {
                SessionInject::Cookie => {
                    // cookie 会走 client 自动附带，不需要改 builder
                    Ok((session_with_token.client.clone(), builder))
                }
                SessionInject::Header { name, format } => {
                    let token = session_with_token
                        .token
                        .clone()
                        .unwrap_or_default();
                    let header_value = format.replace("{token}", &token);
                    builder = builder.header(name, header_value);
                    Ok((session_with_token.client.clone(), builder))
                }
            }
        }
    }
}

async fn ensure_session_login(
    cache_key: &str,
    session: &SessionClient,
    base_url: &str,
    login_url: &str,
    login_method: &str,
    credentials_json: &str,
    token_json_path: Option<&str>,
    inject_as: &SessionInject,
) -> Result<SessionClient, String> {
    // 已登录过就直接返回
    match inject_as {
        SessionInject::Header { .. } => {
            if session.token.is_some() {
                return Ok(session.clone());
            }
        }
        SessionInject::Cookie => {
            // cookie 不容易判断是否在有效期，首次请求按已登录乐观处理；
            // 如果后续 401 再重登（由 execute 层处理）
            // 这里先不做任何登录；让普通请求尝试先
            // 但若从未登录过，需要先登录：用一个 marker——我们无法从 reqwest 观察 cookie 是否存在，所以第一次总是登录。
            // 简化：cookie 模式下每次新创建的 client 都触发一次登录。
            // 通过 session.token 作为"是否登录过"的 marker（即便不用 token 值）
            if session.token.is_some() {
                return Ok(session.clone());
            }
        }
    }

    let url = join_url(base_url, login_url);
    let method = reqwest::Method::from_bytes(login_method.as_bytes())
        .map_err(|e| format!("非法 login_method: {}", e))?;
    let body: Value = serde_json::from_str(credentials_json)
        .map_err(|e| format!("credentialsJson 不是合法 JSON: {}", e))?;

    let resp = session
        .client
        .request(method, &url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("登录请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Session 登录失败 {}: {}",
            status,
            text.chars().take(300).collect::<String>()
        ));
    }

    let token: Option<String>;
    match inject_as {
        SessionInject::Header { .. } => {
            let body: Value = resp
                .json()
                .await
                .map_err(|e| format!("解析登录响应失败: {}", e))?;
            let path = token_json_path.unwrap_or("token");
            token = extract_json_path(&body, path);
            if token.is_none() {
                return Err(format!(
                    "登录响应中找不到 token（path={}）：{}",
                    path,
                    serde_json::to_string(&body).unwrap_or_default()
                ));
            }
        }
        SessionInject::Cookie => {
            // 不需要 token，但要标记已登录
            let _ = resp.text().await;
            token = Some(String::new());
        }
    }

    let updated = SessionClient {
        client: session.client.clone(),
        token,
    };
    {
        let mut guard = SESSION_CLIENTS.lock().await;
        guard.insert(cache_key.to_string(), updated.clone());
    }
    Ok(updated)
}

static NONE_AUTH: ApiAuthConfig = ApiAuthConfig::None;

fn resolve_effective_auth<'a>(
    endpoint: &'a ApiEndpoint,
    group: Option<&'a ApiGroup>,
) -> &'a ApiAuthConfig {
    if let Some(a) = endpoint.auth_override.as_ref() {
        return a;
    }
    group.map(|g| &g.auth).unwrap_or(&NONE_AUTH)
}

#[tauri::command]
pub async fn execute_api_endpoint(
    endpoint_id: String,
    arguments_json: String,
) -> Result<String, String> {
    // 1. 加载 endpoint 和所属 group
    let endpoints = load_endpoints()?;
    let endpoint = endpoints
        .into_iter()
        .find(|e| e.id == endpoint_id)
        .ok_or_else(|| format!("未找到接口: {}", endpoint_id))?;
    let groups = load_groups()?;
    let group = endpoint
        .group_id
        .as_ref()
        .and_then(|gid| groups.into_iter().find(|g| &g.id == gid));

    let base_url = group.as_ref().map(|g| g.base_url.as_str()).unwrap_or("");
    let auth = resolve_effective_auth(&endpoint, group.as_ref());
    let group_cache_key = group.as_ref().map(|g| g.id.as_str());

    // 2. 解析参数
    let args_value: Value = if arguments_json.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(&arguments_json)
            .map_err(|e| format!("arguments 不是合法 JSON: {}", e))?
    };

    let (mut path_map, mut query_map, mut body) = split_arguments(&args_value, &endpoint.method);

    // 若未显式分区，把扁平参数同时作为候选 path 参数
    if path_map.is_empty() {
        if let Some(obj) = args_value.as_object() {
            for (k, v) in obj {
                if !k.starts_with('_') {
                    path_map.insert(k.clone(), v.clone());
                }
            }
        }
    }

    // 3. 拼 URL（先替换 path 占位，再拼 baseUrl）
    let url_with_path = substitute_path_params(&endpoint.url, &path_map);
    let final_url = join_url(base_url, &url_with_path);

    // 4. 构建请求
    let method = reqwest::Method::from_bytes(endpoint.method.to_uppercase().as_bytes())
        .map_err(|e| format!("非法 method: {}", e))?;

    // 普通 client（非 Session 鉴权用）
    let default_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("构建 client 失败: {}", e))?;

    // 若 path 参数被替换到 URL 里，从 body 里挪掉它们避免重复发送
    if let Some(Value::Object(ref mut m)) = body {
        for k in path_map.keys() {
            if endpoint.url.contains(&format!("{{{}}}", k)) {
                m.remove(k);
            }
        }
    }
    if !query_map.is_empty() {
        let keys: Vec<String> = query_map.keys().cloned().collect();
        for k in keys {
            if endpoint.url.contains(&format!("{{{}}}", k)) {
                query_map.remove(&k);
            }
        }
    }

    // 基础 builder
    let mut builder = default_client.request(method.clone(), &final_url);

    // 固定 headers
    for (k, v) in &endpoint.headers {
        builder = builder.header(k, v);
    }

    // query
    if !query_map.is_empty() {
        let qs: Vec<(String, String)> = query_map
            .iter()
            .map(|(k, v)| (k.clone(), value_to_query_string(v)))
            .collect();
        builder = builder.query(&qs);
    }

    // body
    if let Some(ref b) = body {
        if !b.is_null() {
            // 如果 body 是空对象就不带
            let skip = matches!(b, Value::Object(m) if m.is_empty());
            if !skip {
                builder = builder.json(b);
            }
        }
    }

    // 5. 注入鉴权（可能切换到 session 的 client）
    let (active_client, builder) = apply_auth(
        group_cache_key,
        auth,
        base_url,
        builder,
        &default_client,
    )
    .await?;

    // Session 鉴权时需要从头用 active_client 重建请求（因为 builder 原来绑定在 default_client）
    let builder = if matches!(auth, ApiAuthConfig::Session { .. }) {
        let mut b = active_client.request(method, &final_url);
        for (k, v) in &endpoint.headers {
            b = b.header(k, v);
        }
        if !query_map.is_empty() {
            let qs: Vec<(String, String)> = query_map
                .iter()
                .map(|(k, v)| (k.clone(), value_to_query_string(v)))
                .collect();
            b = b.query(&qs);
        }
        if let Some(ref bd) = body {
            if !bd.is_null() {
                let skip = matches!(bd, Value::Object(m) if m.is_empty());
                if !skip {
                    b = b.json(bd);
                }
            }
        }
        // 再次注入鉴权（仅 header 模式需要重附 Authorization；cookie 模式靠 client）
        match auth {
            ApiAuthConfig::Session {
                inject_as: SessionInject::Header { name, format },
                ..
            } => {
                let guard = SESSION_CLIENTS.lock().await;
                let token = guard
                    .get(group_cache_key.unwrap_or("__endpoint_override__"))
                    .and_then(|s| s.token.clone())
                    .unwrap_or_default();
                drop(guard);
                let header_value = format.replace("{token}", &token);
                b = b.header(name, header_value);
                b
            }
            _ => b,
        }
    } else {
        builder
    };

    // 6. 首次发送 + Session 401/403 重登一次
    let resp = builder
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let resp = if matches!(auth, ApiAuthConfig::Session { .. })
        && (resp.status() == reqwest::StatusCode::UNAUTHORIZED
            || resp.status() == reqwest::StatusCode::FORBIDDEN)
    {
        // 清 client 缓存，重登重发
        drop_session_client(group_cache_key.unwrap_or("__endpoint_override__")).await;
        // 重走一遍整体流程（简单直接：递归一次）
        return Box::pin(execute_api_endpoint(endpoint_id, arguments_json)).await;
    } else {
        resp
    };

    // 7. 响应读取与截断
    let status = resp.status();
    let trim = endpoint
        .response_trim_bytes
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_RESPONSE_TRIM_BYTES);
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;
    let body_str = trim_response(&bytes, trim);

    Ok(format!("HTTP {}\n\n{}", status, body_str))
}
