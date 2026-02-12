// 数据结构定义 - 简洁的数据格式，无版本包装

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ============== 项目数据 ==============

/// 项目
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_favorite: bool,
    pub tags: Vec<String>,      // 分类（单选，但保留数组兼容）
    pub labels: Vec<String>,    // 标签（多选）
    pub created_at: String,
    pub updated_at: String,
    pub last_opened: Option<String>,
}

// ============== 统计缓存数据 ==============

/// 统计缓存
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StatsCache {
    pub stats: DashboardStats,
    pub heatmap_data: Vec<DailyActivity>,
    pub recent_commits: Vec<RecentCommit>,
    pub last_updated: i64,
    pub dirty_projects: HashSet<String>,
    pub project_stats: HashMap<String, ProjectStatsCache>,
}

/// 统计数据
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DashboardStats {
    pub total_projects: u32,
    pub today_commits: u32,
    pub week_commits: u32,
    pub unpushed_commits: u32,
    pub unmerged_branches: u32,
    pub last_updated: String,
}

/// 每日活动
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyActivity {
    pub date: String,
    pub count: u32,
}

/// 最近提交
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub project_name: String,
    pub project_path: String,
}

/// 项目统计缓存
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProjectStatsCache {
    pub unpushed: u32,
    pub commits_by_date: HashMap<String, u32>,
    pub recent_commits: Vec<RecentCommit>,
    pub last_updated: i64,
}

// ============== Claude 配置档案数据 ==============

/// Claude 配置档案（按环境分组）
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ClaudeProfiles {
    pub environments: HashMap<String, Vec<ConfigProfile>>,
}

/// 配置档案
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub settings: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

// ============== 下载任务数据 ==============

/// 下载任务
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    pub save_path: String,
    pub file_name: String,
    pub total_size: u64,
    pub downloaded_size: u64,
    pub status: String,
    pub speed: u64,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ============== 转发规则数据 ==============

/// 转发规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardRule {
    pub id: String,
    pub name: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub created_at: String,
}

// ============== 服务配置数据 ==============

/// 服务配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub port: u16,
    pub root_dir: String,
    pub cors: bool,
    pub gzip: bool,
    pub cache_control: Option<String>,
    pub url_prefix: String,
    pub index_page: Option<String>,
    pub proxies: Vec<ProxyConfig>,
    pub created_at: String,
}

/// 代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub prefix: String,
    pub target: String,
}

// ============== 编辑器配置数据 ==============

/// 编辑器配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EditorConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
    pub is_default: bool,
}

// ============== 终端配置数据 ==============

/// 终端配置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TerminalConfig {
    pub terminal_type: String,
    pub custom_path: Option<String>,
    pub terminal_path: Option<String>,
}

// ============== 应用设置数据 ==============

/// 应用设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub view_mode: String,
    pub sidebar_collapsed: bool,
    pub scan_depth: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            view_mode: "grid".to_string(),
            sidebar_collapsed: false,
            scan_depth: 3,
        }
    }
}

// ============== UI 状态数据 ==============

/// UI 状态
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct UiState {
    pub recent_detail_project_ids: Vec<String>,
}

// ============== 通知数据 ==============

/// 单条通知
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notification {
    pub id: String,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub created_at: String,
}

// ============== Claude 快捷配置数据 ==============

/// Claude 快捷配置选项
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeQuickConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub config_key: String,
    pub value_type: String,
    pub default_value: serde_json::Value,
    pub options: Option<Vec<ClaudeConfigSelectOption>>,
    pub placeholder: Option<String>,
    pub allow_empty: Option<bool>,
}

/// 配置选项
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeConfigSelectOption {
    pub label: String,
    pub value: serde_json::Value,
}

// ============== Claude 安装信息缓存数据 ==============

/// Claude Code 安装信息
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeInstallation {
    pub env_type: String,
    pub env_name: String,
    pub version: Option<String>,
    pub config_dir: String,
    pub config_files: Vec<ConfigFileInfo>,
}

/// 配置文件信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigFileInfo {
    pub name: String,
    pub path: String,
    pub exists: bool,
}

// ============== 工具函数 ==============

/// 获取当前时间字符串
pub fn current_time() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// 获取当前 ISO 时间字符串
pub fn current_iso_time() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// 获取当前时间戳
pub fn current_timestamp() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 生成唯一 ID
pub fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", timestamp)
}
