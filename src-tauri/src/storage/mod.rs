// 存储模块 - 统一管理所有数据的持久化存储

pub mod config;
pub mod schema;
pub mod migration;

use config::StorageConfig;
use once_cell::sync::Lazy;
use std::sync::Mutex;

/// 全局存储配置
pub static STORAGE_CONFIG: Lazy<Mutex<Option<StorageConfig>>> = Lazy::new(|| Mutex::new(None));

/// 初始化存储系统
/// 应在应用启动时调用
pub fn init_storage() -> Result<(), String> {
    let config = StorageConfig::new()?;
    config.ensure_dirs()?;

    // 执行数据迁移
    migration::run_migrations(&config)?;

    // 保存配置供后续使用
    let mut global_config = STORAGE_CONFIG.lock().map_err(|e| e.to_string())?;
    *global_config = Some(config);

    Ok(())
}

/// 获取存储配置
pub fn get_storage_config() -> Result<StorageConfig, String> {
    let config = STORAGE_CONFIG.lock().map_err(|e| e.to_string())?;
    config.clone().ok_or_else(|| "存储系统未初始化".to_string())
}
