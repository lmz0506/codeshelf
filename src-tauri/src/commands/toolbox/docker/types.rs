use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerStatus {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerCommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageInfo {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_since: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerInfo {
    pub id: String,
    pub image: String,
    pub names: String,
    pub status: String,
    /// docker ps 的 State 字段：running / exited / paused / created / restarting / dead / removing
    pub state: String,
    pub ports: String,
    pub compose_project: Option<String>,
    pub compose_service: Option<String>,
    pub compose_working_dir: Option<String>,
    pub compose_config_files: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerBuildInput {
    pub project_path: String,
    pub dockerfile_path: String,
    pub image_name: String,
    pub tag: Option<String>,
    pub no_cache: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerRunInput {
    pub image: String,
    pub container_name: Option<String>,
    pub ports: Option<Vec<String>>,
    pub env: Option<Vec<String>>,
    pub volumes: Option<Vec<String>>,
    pub network: Option<String>,
    pub restart: Option<String>,
    pub user: Option<String>,
    pub workdir: Option<String>,
    pub command: Option<String>,
    pub privileged: Option<bool>,
    pub read_only: Option<bool>,
    pub extra_args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerAiGenerateInput {
    pub project_path: String,
    pub dockerfile_path: Option<String>,
    pub image_name: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerAiGenerateOutput {
    pub content: String,
    pub provider_name: String,
    pub model_name: String,
}
