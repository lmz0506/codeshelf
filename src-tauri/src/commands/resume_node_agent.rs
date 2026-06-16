use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::RwLock;

use crate::error::{AppError, AppResult};
use crate::storage::schema::{AiProviderConfig, Project};
use crate::storage::get_storage_config;

const RUN_EVENT: &str = "resume-agent-run-event-v3";

static RUN_PIDS: Lazy<Arc<RwLock<HashMap<String, u32>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum NodeJobDirection {
    Backend,
    Frontend,
    Fullstack,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum NodeTone {
    Professional,
    Concise,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionMode {
    ReadOnly,
    WorkspaceWrite,
    FullAgent,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RunResumeDeepAgentRequest {
    pub request_id: String,
    pub project_id: String,
    pub provider: AiProviderConfig,
    pub job_direction: NodeJobDirection,
    pub jd_keywords: Vec<String>,
    pub tone: NodeTone,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_config: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_permission_mode: Option<ToolPermissionMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeInput {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResumeFromKnowledgeRequest {
    pub request_id: String,
    pub provider: AiProviderConfig,
    pub job_direction: NodeJobDirection,
    pub jd_keywords: Vec<String>,
    pub tone: NodeTone,
    pub knowledge_docs: Vec<KnowledgeInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_config: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResumeFragmentRequest {
    pub request_id: String,
    pub provider: AiProviderConfig,
    pub job_direction: NodeJobDirection,
    pub jd_keywords: Vec<String>,
    pub tone: NodeTone,
    pub knowledge_docs: Vec<KnowledgeInput>,
    pub fragment: Value,
}

#[tauri::command]
#[specta::specta]
pub async fn run_resume_deep_agent(
    app: AppHandle,
    request: RunResumeDeepAgentRequest,
) -> AppResult<Value> {
    let project = load_project(&request.project_id).await?;
    let data_dir = get_storage_config()?.data_dir.to_string_lossy().to_string();
    let sensitive_rules = crate::commands::settings::load_sensitive_file_patterns()
        .unwrap_or_else(|_| crate::commands::settings::default_sensitive_file_patterns())
        .into_iter()
        .map(|pattern| json!({ "pattern": pattern, "enabled": true }))
        .collect::<Vec<_>>();

    let params = json!({
        "requestId": request.request_id,
        "project": {
            "id": project.id,
            "name": project.name,
            "path": project.path,
            "tags": project.tags,
            "labels": project.labels,
        },
        "provider": request.provider,
        "jobDirection": request.job_direction,
        "jdKeywords": request.jd_keywords,
        "tone": request.tone,
        "dataDir": data_dir,
        "sensitiveRules": sensitive_rules,
        "promptConfig": request.prompt_config,
        "toolPermissionMode": request.tool_permission_mode.unwrap_or(ToolPermissionMode::ReadOnly),
    });
    call_node_rpc_with_events(
        Some(app),
        "run_agent",
        params,
        Some(request.request_id.clone()),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn generate_resume_from_knowledge(
    request: GenerateResumeFromKnowledgeRequest,
) -> AppResult<Value> {
    let params = json!({
        "requestId": request.request_id,
        "provider": request.provider,
        "jobDirection": request.job_direction,
        "jdKeywords": request.jd_keywords,
        "tone": request.tone,
        "dataDir": data_dir_string()?,
        "knowledgeDocs": request.knowledge_docs,
        "promptConfig": request.prompt_config,
    });
    call_node_rpc_with_events(
        None,
        "generate_resume",
        params,
        Some(request.request_id.clone()),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn generate_resume_fragment(
    request: GenerateResumeFragmentRequest,
) -> AppResult<Value> {
    let params = json!({
        "requestId": request.request_id,
        "provider": request.provider,
        "jobDirection": request.job_direction,
        "jdKeywords": request.jd_keywords,
        "tone": request.tone,
        "dataDir": data_dir_string()?,
        "knowledgeDocs": request.knowledge_docs,
        "fragment": request.fragment,
    });
    call_node_rpc_with_events(
        None,
        "generate_resume_fragment",
        params,
        Some(request.request_id.clone()),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_resume_deep_agent(request_id: String) -> AppResult<()> {
    if let Some(pid) = RUN_PIDS.write().await.remove(&request_id) {
        kill_process_tree(pid).await;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_resume_agent_runs(project_id: String) -> AppResult<Value> {
    call_node_rpc(
        "get_runs",
        json!({
            "dataDir": data_dir_string()?,
            "projectId": project_id,
        }),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn read_resume_agent_artifact(
    project_id: String,
    artifact_id: String,
) -> AppResult<Value> {
    call_node_rpc(
        "read_artifact",
        json!({
            "dataDir": data_dir_string()?,
            "projectId": project_id,
            "artifactId": artifact_id,
        }),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_resume_agent_prompt_config() -> AppResult<Value> {
    call_node_rpc(
        "get_prompt_config",
        json!({ "dataDir": data_dir_string()? }),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn save_resume_agent_prompt_config(config: Value) -> AppResult<Value> {
    call_node_rpc(
        "save_prompt_config",
        json!({
            "dataDir": data_dir_string()?,
            "config": config,
        }),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn reset_resume_agent_prompt_config() -> AppResult<Value> {
    call_node_rpc(
        "reset_prompt_config",
        json!({ "dataDir": data_dir_string()? }),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn load_resume_agent_background(project_id: String) -> AppResult<Option<String>> {
    let value = call_node_rpc(
        "load_background",
        json!({
            "dataDir": data_dir_string()?,
            "projectId": project_id,
        }),
    )
    .await?;
    Ok(value.as_str().map(|s| s.to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn save_resume_agent_background(project_id: String, content: String) -> AppResult<()> {
    let _ = call_node_rpc(
        "save_background",
        json!({
            "dataDir": data_dir_string()?,
            "projectId": project_id,
            "content": content,
        }),
    )
    .await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_resume_agent_background() -> AppResult<Value> {
    call_node_rpc(
        "list_background",
        json!({ "dataDir": data_dir_string()? }),
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_resume_agent_background(project_id: String) -> AppResult<()> {
    let _ = call_node_rpc(
        "delete_background",
        json!({
            "dataDir": data_dir_string()?,
            "projectId": project_id,
        }),
    )
    .await?;
    Ok(())
}

fn data_dir_string() -> AppResult<String> {
    Ok(get_storage_config()?.data_dir.to_string_lossy().to_string())
}

async fn call_node_rpc(method: &str, params: Value) -> AppResult<Value> {
    call_node_rpc_with_events(None, method, params, None).await
}

async fn call_node_rpc_with_events(
    app: Option<AppHandle>,
    method: &str,
    params: Value,
    request_id_for_pid: Option<String>,
) -> AppResult<Value> {
    let main_js = node_agent_main_js()?;
    let mut child = Command::new("node")
        .arg(main_js)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::from(format!("启动 Node resume agent 失败: {}", e)))?;

    if let (Some(request_id), Some(pid)) = (request_id_for_pid.clone(), child.id()) {
        RUN_PIDS.write().await.insert(request_id, pid);
    }

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::from("Node resume agent stdin 不可用"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::from("Node resume agent stdout 不可用"))?;
    let stderr = child.stderr.take();

    let rpc_id = format!("rpc-{}", chrono::Utc::now().timestamp_micros());
    let payload = json!({ "id": rpc_id, "method": method, "params": params });
    stdin
        .write_all(format!("{}\n", payload).as_bytes())
        .await
        .map_err(|e| AppError::from(format!("写入 Node resume agent 请求失败: {}", e)))?;
    drop(stdin);

    let stderr_task = tokio::spawn(async move {
        let Some(stderr) = stderr else {
            return String::new();
        };
        let mut lines = BufReader::new(stderr).lines();
        let mut out = String::new();
        while let Ok(Some(line)) = lines.next_line().await {
            out.push_str(&line);
            out.push('\n');
        }
        out
    });

    let mut lines = BufReader::new(stdout).lines();
    let mut response: Option<Value> = None;
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| AppError::from(format!("读取 Node resume agent 输出失败: {}", e)))?
    {
        let parsed: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if parsed.get("type").and_then(|v| v.as_str()) == Some("event") {
            if let Some(app) = app.as_ref() {
                let _ = app.emit(RUN_EVENT, parsed);
            }
            continue;
        }
        if parsed.get("id").and_then(|v| v.as_str()) == Some(rpc_id.as_str()) {
            response = Some(parsed);
            break;
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::from(format!("等待 Node resume agent 退出失败: {}", e)))?;
    if let Some(request_id) = request_id_for_pid {
        RUN_PIDS.write().await.remove(&request_id);
    }
    let stderr_text = stderr_task.await.unwrap_or_default();
    let Some(response) = response else {
        return Err(AppError::from(format!(
            "Node resume agent 无响应, status={}, stderr={}",
            status, stderr_text
        )));
    };
    if response.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    } else {
        Err(AppError::from(
            response
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Node resume agent 调用失败")
                .to_string(),
        ))
    }
}

fn node_agent_main_js() -> AppResult<PathBuf> {
    let cwd = std::env::current_dir()
        .map_err(|e| AppError::from(format!("获取当前目录失败: {}", e)))?;
    let candidates = [
        cwd.join("src-node/resume-agent/dist/main.js"),
        cwd.join("../src-node/resume-agent/dist/main.js"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("sidecars/resume-agent/main.js")))
            .unwrap_or_default(),
    ];
    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| {
            AppError::from(
                "未找到 Node resume agent，请先运行 npm run resume-agent:build".to_string(),
            )
        })
}

async fn load_project(project_id: &str) -> AppResult<Project> {
    crate::commands::project::get_projects()
        .await?
        .into_iter()
        .find(|project| project.id == project_id)
        .ok_or_else(|| AppError::from(format!("项目不存在: {}", project_id)))
}

async fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
            .await;
    }
}
