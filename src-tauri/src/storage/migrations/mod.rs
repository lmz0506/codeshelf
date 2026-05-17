// 迁移协调器：按版本号顺序应用未完成的迁移。
//
// 当前实现 v1：建表 + 从 JSON 搬迁现有数据。
//
// 重要约束：
// - 任何 step 失败都不应破坏原 JSON 文件（用户能手动恢复）
// - 备份在最前面执行，确保即使后续步骤崩溃也有完整副本
// - 表创建用 raw_sql 一次性执行（v1_initial.sql 包含多个 CREATE）
// - 数据搬迁每个数据集一个事务，单个数据集失败时其他已迁移的不回滚

use std::fs;
use std::path::{Path, PathBuf};

use crate::storage::db::{get_schema_version, pool, set_schema_version};

mod v1_from_json;

const V1_INITIAL_SQL: &str = include_str!("v1_initial.sql");

/// 应用所有待执行的迁移。`data_dir` 是 JSON 文件所在目录。
pub async fn run_migrations(data_dir: &Path) -> Result<(), String> {
    let current = get_schema_version().await?;

    if current < 1 {
        log::info!("数据库 schema_version={}，开始执行 v1 迁移", current);
        run_v1(data_dir).await?;
        set_schema_version(1).await?;
        log::info!("v1 迁移完成，schema_version=1");
    } else {
        log::debug!("数据库 schema_version={}，无迁移待执行", current);
    }

    Ok(())
}

async fn run_v1(data_dir: &Path) -> Result<(), String> {
    // Step 1: 备份整个 data 目录（关键保险）
    let backup_dir = make_backup_dir(data_dir)?;
    log::info!("备份数据目录到: {:?}", backup_dir);
    backup_directory(data_dir, &backup_dir)?;

    // Step 2: 建表
    log::info!("创建 v1 表结构");
    sqlx::raw_sql(V1_INITIAL_SQL)
        .execute(pool())
        .await
        .map_err(|e| format!("建表失败: {}", e))?;

    // Step 3: 逐数据集搬迁。任一失败立即终止（用户应能在日志里看到原因，
    //         并通过 backup_<ts> 目录恢复）。
    v1_from_json::migrate_projects(data_dir).await?;
    v1_from_json::migrate_chat(data_dir).await?;
    v1_from_json::migrate_clipboard(data_dir).await?;
    v1_from_json::migrate_stats(data_dir).await?;

    // Step 4: 给原 JSON / 目录改名加 .migrated 后缀（不删除）
    v1_from_json::mark_files_migrated(data_dir)?;

    Ok(())
}

fn make_backup_dir(data_dir: &Path) -> Result<PathBuf, String> {
    let parent = data_dir
        .parent()
        .ok_or_else(|| "无法定位 data_dir 父目录".to_string())?;
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    Ok(parent.join(format!("backup_{}", ts)))
}

fn backup_directory(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        // 干净启动，没有数据需要备份
        return Ok(());
    }
    // 目录可能空 —— 仍然创建一个空备份目录，作为"迁移执行过"的证据
    fs::create_dir_all(dst).map_err(|e| format!("创建备份目录失败: {}", e))?;
    copy_dir_recursive(src, dst)?;
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| format!("读取目录 {:?} 失败: {}", src, e))? {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let ft = entry
            .file_type()
            .map_err(|e| format!("读取类型失败 {:?}: {}", from, e))?;
        if ft.is_dir() {
            fs::create_dir_all(&to).map_err(|e| format!("创建子目录 {:?} 失败: {}", to, e))?;
            copy_dir_recursive(&from, &to)?;
        } else if ft.is_file() {
            fs::copy(&from, &to).map_err(|e| format!("复制 {:?} 失败: {}", from, e))?;
        }
    }
    Ok(())
}
