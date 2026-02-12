// 存储路径配置

use std::fs;
use std::path::PathBuf;

/// 存储配置
#[derive(Debug, Clone)]
pub struct StorageConfig {
    /// 数据目录: <安装目录>/data
    pub data_dir: PathBuf,
    /// 日志目录: <安装目录>/logs
    pub logs_dir: PathBuf,
    /// 安装目录
    pub install_dir: PathBuf,
}

impl StorageConfig {
    /// 创建存储配置
    pub fn new() -> Result<Self, String> {
        let install_dir = get_install_dir()?;

        Ok(Self {
            data_dir: install_dir.join("data"),
            logs_dir: install_dir.join("logs"),
            install_dir,
        })
    }

    /// 确保目录存在
    pub fn ensure_dirs(&self) -> Result<(), String> {
        fs::create_dir_all(&self.data_dir)
            .map_err(|e| format!("创建数据目录失败: {}", e))?;
        fs::create_dir_all(&self.logs_dir)
            .map_err(|e| format!("创建日志目录失败: {}", e))?;
        Ok(())
    }

    /// 获取项目数据文件路径
    pub fn projects_file(&self) -> PathBuf {
        self.data_dir.join("projects.json")
    }

    /// 获取统计缓存文件路径
    pub fn stats_cache_file(&self) -> PathBuf {
        self.data_dir.join("stats_cache.json")
    }

    /// 获取Claude配置档案文件路径
    pub fn claude_profiles_file(&self) -> PathBuf {
        self.data_dir.join("claude_profiles.json")
    }

    /// 获取下载任务文件路径
    pub fn download_tasks_file(&self) -> PathBuf {
        self.data_dir.join("download_tasks.json")
    }

    /// 获取转发规则文件路径
    pub fn forward_rules_file(&self) -> PathBuf {
        self.data_dir.join("forward_rules.json")
    }

    /// 获取服务配置文件路径
    pub fn server_configs_file(&self) -> PathBuf {
        self.data_dir.join("server_configs.json")
    }

    /// 获取标签数据文件路径
    pub fn labels_file(&self) -> PathBuf {
        self.data_dir.join("labels.json")
    }

    /// 获取分类数据文件路径
    pub fn categories_file(&self) -> PathBuf {
        self.data_dir.join("categories.json")
    }

    /// 获取编辑器配置文件路径
    pub fn editors_file(&self) -> PathBuf {
        self.data_dir.join("editors.json")
    }

    /// 获取终端配置文件路径
    pub fn terminal_file(&self) -> PathBuf {
        self.data_dir.join("terminal.json")
    }

    /// 获取应用设置文件路径
    pub fn app_settings_file(&self) -> PathBuf {
        self.data_dir.join("app_settings.json")
    }

    /// 获取迁移状态文件路径
    pub fn migration_file(&self) -> PathBuf {
        self.data_dir.join("migration.json")
    }

    /// 获取UI状态文件路径
    pub fn ui_state_file(&self) -> PathBuf {
        self.data_dir.join("ui_state.json")
    }

    /// 获取通知数据文件路径
    pub fn notifications_file(&self) -> PathBuf {
        self.data_dir.join("notifications.json")
    }

    /// 获取Claude快捷配置文件路径
    pub fn claude_quick_configs_file(&self) -> PathBuf {
        self.data_dir.join("claude_quick_configs.json")
    }

    /// 获取Claude安装信息缓存文件路径
    pub fn claude_installations_cache_file(&self) -> PathBuf {
        self.data_dir.join("claude_installations_cache.json")
    }
}

/// 获取安装目录
fn get_install_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("获取可执行文件路径失败: {}", e))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "无法获取安装目录".to_string())
}

/// 获取旧数据目录（用于迁移）
pub fn get_old_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|p| p.join("codeshelf"))
}

/// 获取旧配置目录（用于迁移）
pub fn get_old_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("codeshelf"))
}
