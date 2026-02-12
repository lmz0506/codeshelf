// 数据迁移模块 - 处理从旧版本到新版本的数据迁移

use super::config::{get_old_config_dir, get_old_data_dir, StorageConfig};
use super::schema::*;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// 当前数据版本
pub const CURRENT_VERSION: u32 = 1;

/// 执行所有必要的迁移
pub fn run_migrations(config: &StorageConfig) -> Result<(), String> {
    let migration_file = config.migration_file();

    // 读取当前迁移状态
    let mut migration_data = if migration_file.exists() {
        let content = fs::read_to_string(&migration_file)
            .map_err(|e| format!("读取迁移文件失败: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        MigrationData::default()
    };

    // 检查是否需要执行 v0 -> v1 迁移（首次迁移）
    if migration_data.last_migration_version == 0 {
        println!("执行数据迁移: v0 -> v1");

        match migrate_v0_to_v1(config) {
            Ok(_) => {
                migration_data.migrations.push(MigrationRecord {
                    id: "v1_initial".to_string(),
                    completed_at: current_iso_time(),
                    success: true,
                });
                migration_data.last_migration_version = 1;
                println!("数据迁移完成: v0 -> v1");
            }
            Err(e) => {
                println!("数据迁移警告: {}", e);
                // 即使迁移失败，也创建空的数据文件
                create_empty_data_files(config)?;
                migration_data.migrations.push(MigrationRecord {
                    id: "v1_initial".to_string(),
                    completed_at: current_iso_time(),
                    success: false,
                });
                migration_data.last_migration_version = 1;
            }
        }

        // 保存迁移状态
        save_migration_data(&migration_file, &migration_data)?;
    }

    // 未来版本迁移...
    // if migration_data.last_migration_version < 2 {
    //     migrate_v1_to_v2(config)?;
    //     migration_data.last_migration_version = 2;
    // }

    Ok(())
}

/// v0 -> v1 迁移
/// 从旧位置迁移数据到新位置，并转换格式
fn migrate_v0_to_v1(config: &StorageConfig) -> Result<(), String> {
    // 1. 迁移项目数据
    migrate_projects(config)?;

    // 2. 迁移统计缓存
    migrate_stats_cache(config)?;

    // 3. 迁移 Claude 配置档案
    migrate_claude_profiles(config)?;

    // 4. 创建新的空数据文件（下载/转发/服务）
    create_toolbox_data_files(config)?;

    // 5. 创建设置相关数据文件（标签/分类/编辑器/终端/应用设置）
    create_settings_data_files(config)?;

    Ok(())
}

/// 迁移项目数据
fn migrate_projects(config: &StorageConfig) -> Result<(), String> {
    let new_file = config.projects_file();

    // 如果新文件已存在，跳过
    if new_file.exists() {
        return Ok(());
    }

    // 尝试从旧位置读取
    if let Some(old_dir) = get_old_data_dir() {
        let old_file = old_dir.join("projects.json");
        if old_file.exists() {
            println!("迁移项目数据: {} -> {}", old_file.display(), new_file.display());

            let content = fs::read_to_string(&old_file)
                .map_err(|e| format!("读取旧项目数据失败: {}", e))?;

            // 旧格式是 Vec<Project>，新格式是 VersionedData<ProjectsData>
            let old_projects: Vec<Project> = serde_json::from_str(&content)
                .map_err(|e| format!("解析旧项目数据失败: {}", e))?;

            let new_data = VersionedData {
                version: CURRENT_VERSION,
                last_updated: current_iso_time(),
                data: ProjectsData {
                    projects: old_projects,
                },
            };

            let new_content = serde_json::to_string_pretty(&new_data)
                .map_err(|e| format!("序列化新项目数据失败: {}", e))?;

            fs::write(&new_file, new_content)
                .map_err(|e| format!("写入新项目数据失败: {}", e))?;

            return Ok(());
        }
    }

    // 没有旧数据，创建空文件
    create_empty_projects_file(&new_file)
}

/// 迁移统计缓存
fn migrate_stats_cache(config: &StorageConfig) -> Result<(), String> {
    let new_file = config.stats_cache_file();

    if new_file.exists() {
        return Ok(());
    }

    if let Some(old_dir) = get_old_data_dir() {
        let old_file = old_dir.join("stats_cache.json");
        if old_file.exists() {
            println!("迁移统计缓存: {} -> {}", old_file.display(), new_file.display());

            let content = fs::read_to_string(&old_file)
                .map_err(|e| format!("读取旧统计缓存失败: {}", e))?;

            // 旧格式和新格式可能相同，但我们加上版本号
            let old_cache: StatsCacheData = serde_json::from_str(&content)
                .unwrap_or_default();

            let new_data = VersionedData {
                version: CURRENT_VERSION,
                last_updated: current_iso_time(),
                data: old_cache,
            };

            let new_content = serde_json::to_string_pretty(&new_data)
                .map_err(|e| format!("序列化新统计缓存失败: {}", e))?;

            fs::write(&new_file, new_content)
                .map_err(|e| format!("写入新统计缓存失败: {}", e))?;

            return Ok(());
        }
    }

    create_empty_stats_cache_file(&new_file)
}

/// 迁移 Claude 配置档案
fn migrate_claude_profiles(config: &StorageConfig) -> Result<(), String> {
    let new_file = config.claude_profiles_file();

    if new_file.exists() {
        return Ok(());
    }

    let mut all_profiles = ClaudeProfilesData::default();

    if let Some(old_dir) = get_old_config_dir() {
        // 查找所有 claude_profiles_*.json 文件
        if old_dir.exists() {
            if let Ok(entries) = fs::read_dir(&old_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("claude_profiles_") && name.ends_with(".json") {
                            // 提取环境名称
                            let env_name = name
                                .trim_start_matches("claude_profiles_")
                                .trim_end_matches(".json");

                            println!("迁移 Claude 配置档案: {} ({})", path.display(), env_name);

                            if let Ok(content) = fs::read_to_string(&path) {
                                // 旧格式是 Vec<ConfigProfile>
                                if let Ok(profiles) = serde_json::from_str::<Vec<ConfigProfile>>(&content) {
                                    all_profiles.environments.insert(
                                        env_name.to_string(),
                                        EnvironmentProfiles { profiles },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 写入合并后的配置
    let new_data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: all_profiles,
    };

    let new_content = serde_json::to_string_pretty(&new_data)
        .map_err(|e| format!("序列化 Claude 配置档案失败: {}", e))?;

    fs::write(&new_file, new_content)
        .map_err(|e| format!("写入 Claude 配置档案失败: {}", e))?;

    Ok(())
}

/// 创建工具箱数据文件
fn create_toolbox_data_files(config: &StorageConfig) -> Result<(), String> {
    // 下载任务
    create_empty_download_tasks_file(&config.download_tasks_file())?;

    // 转发规则
    create_empty_forward_rules_file(&config.forward_rules_file())?;

    // 服务配置
    create_empty_server_configs_file(&config.server_configs_file())?;

    Ok(())
}

/// 创建设置相关数据文件
fn create_settings_data_files(config: &StorageConfig) -> Result<(), String> {
    // 标签
    create_empty_labels_file(&config.labels_file())?;

    // 分类
    create_empty_categories_file(&config.categories_file())?;

    // 编辑器配置
    create_empty_editors_file(&config.editors_file())?;

    // 终端配置
    create_empty_terminal_file(&config.terminal_file())?;

    // 应用设置
    create_empty_app_settings_file(&config.app_settings_file())?;

    Ok(())
}

/// 创建所有空数据文件
fn create_empty_data_files(config: &StorageConfig) -> Result<(), String> {
    create_empty_projects_file(&config.projects_file())?;
    create_empty_stats_cache_file(&config.stats_cache_file())?;
    create_empty_claude_profiles_file(&config.claude_profiles_file())?;
    create_toolbox_data_files(config)?;
    create_settings_data_files(config)?;
    Ok(())
}

// ============== 创建空文件的辅助函数 ==============

fn create_empty_projects_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: ProjectsData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_stats_cache_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: StatsCacheData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_claude_profiles_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: ClaudeProfilesData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_download_tasks_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: DownloadTasksData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_forward_rules_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: ForwardRulesData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_server_configs_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: ServerConfigsData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_labels_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    // 默认标签
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: LabelsData {
            labels: vec![
                "Java".to_string(),
                "Python".to_string(),
                "JavaScript".to_string(),
                "TypeScript".to_string(),
                "Rust".to_string(),
                "Go".to_string(),
                "Vue".to_string(),
                "React".to_string(),
                "Spring Boot".to_string(),
                "小程序".to_string(),
            ],
        },
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_categories_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    // 默认分类
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: CategoriesData {
            categories: vec![
                "工作".to_string(),
                "个人".to_string(),
                "学习".to_string(),
                "测试".to_string(),
            ],
        },
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_editors_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: EditorsData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_terminal_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: TerminalData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn create_empty_app_settings_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let data = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: AppSettingsData::default(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

fn save_migration_data(path: &Path, data: &MigrationData) -> Result<(), String> {
    let versioned = VersionedData {
        version: CURRENT_VERSION,
        last_updated: current_iso_time(),
        data: data.clone(),
    };
    let content = serde_json::to_string_pretty(&versioned)
        .map_err(|e| format!("序列化迁移数据失败: {}", e))?;
    fs::write(path, content).map_err(|e| format!("写入迁移文件失败: {}", e))
}
