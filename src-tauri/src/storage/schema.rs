// 数据结构定义 - 所有持久化数据的 Schema

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ============== 通用版本化容器 ==============

/// 版本化数据容器
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionedData<T> {
    pub version: u32,
    pub last_updated: String,
    #[serde(flatten)]
    pub data: T,
}

// ============== 项目数据 ==============

/// 项目数据文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProjectsData {
    pub projects: Vec<Project>,
}

/// 项目
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(alias = "is_favorite")]
    pub is_favorite: bool,
    pub tags: Vec<String>,
    pub labels: Vec<String>,
    #[serde(alias = "created_at")]
    pub created_at: String,
    #[serde(alias = "updated_at")]
    pub updated_at: String,
    #[serde(alias = "last_opened")]
    pub last_opened: Option<String>,
}

// ============== 统计缓存数据 ==============

/// 统计缓存文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StatsCacheData {
    pub data: CachedDashboardData,
    pub last_updated: i64,
    pub dirty_projects: HashSet<String>,
    pub project_stats: HashMap<String, ProjectStatsCache>,
}

/// Dashboard 数据
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CachedDashboardData {
    pub stats: DashboardStats,
    pub heatmap_data: Vec<DailyActivity>,
    pub recent_commits: Vec<RecentCommit>,
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

/// Claude 配置档案文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ClaudeProfilesData {
    pub environments: HashMap<String, EnvironmentProfiles>,
}

/// 环境配置档案
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct EnvironmentProfiles {
    pub profiles: Vec<ConfigProfile>,
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

/// 下载任务文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DownloadTasksData {
    pub tasks: Vec<DownloadTask>,
}

/// 下载任务
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    pub save_path: String,
    pub file_name: String,
    pub total_size: u64,
    pub downloaded_size: u64,
    pub status: String, // "pending", "downloading", "paused", "completed", "failed", "cancelled"
    pub speed: u64,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ============== 转发规则数据 ==============

/// 转发规则文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ForwardRulesData {
    pub rules: Vec<ForwardRule>,
}

/// 转发规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardRule {
    pub id: String,
    pub name: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub auto_start: bool,
    pub created_at: String,
}

// ============== 服务配置数据 ==============

/// 服务配置文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ServerConfigsData {
    pub servers: Vec<ServerConfig>,
}

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
    pub proxies: Vec<ProxyConfig>,
    pub auto_start: bool,
    pub created_at: String,
}

/// 代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub prefix: String,
    pub target: String,
}

// ============== 迁移状态数据 ==============

/// 迁移状态文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MigrationData {
    pub migrations: Vec<MigrationRecord>,
    pub last_migration_version: u32,
}

/// 迁移记录
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MigrationRecord {
    pub id: String,
    pub completed_at: String,
    pub success: bool,
}

// ============== 标签数据 ==============

/// 标签数据文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct LabelsData {
    pub labels: Vec<String>,
}

// ============== 分类数据 ==============

/// 分类数据文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CategoriesData {
    pub categories: Vec<String>,
}

// ============== 编辑器配置数据 ==============

/// 编辑器配置文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct EditorsData {
    pub editors: Vec<EditorConfig>,
}

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

/// 终端配置文件结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TerminalData {
    pub terminal_type: String,
    pub custom_path: Option<String>,
    pub terminal_path: Option<String>,
}

// ============== 应用设置数据 ==============

/// 应用设置文件结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettingsData {
    pub theme: String,
    pub view_mode: String,
    pub sidebar_collapsed: bool,
    pub scan_depth: u32,
}

impl Default for AppSettingsData {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            view_mode: "grid".to_string(),
            sidebar_collapsed: false,
            scan_depth: 3,
        }
    }
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
