// 迁移协调器：按版本号顺序应用未完成的迁移。
//
// 当前实现 v1：建表 + 从 JSON 搬迁现有数据。
//
// 重要约束：
// - 任何 step 失败都不应破坏原 JSON 文件（用户能手动恢复）
// - 备份在最前面执行，确保即使后续步骤崩溃也有完整副本
// - 表创建用 raw_sql 一次性执行（v1_initial.sql 包含多个 CREATE）
// - 数据搬迁每个数据集一个事务，单个数据集失败时其他已迁移的不回滚

use crate::error::AppResult;
use std::fs;
use std::path::{Path, PathBuf};

use crate::storage::db::{get_schema_version, pool, set_schema_version};

mod v1_from_json;

const V1_INITIAL_SQL: &str = include_str!("v1_initial.sql");

const PENDING_RESTORE_FLAG: &str = ".pending_restore";

/// 应用所有待执行的迁移。`data_dir` 是 JSON 文件所在目录。
pub async fn run_migrations(data_dir: &Path) -> AppResult<()> {
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

async fn run_v1(data_dir: &Path) -> AppResult<()> {
    // Step 1: 备份整个 data 目录（关键保险）
    let backup_dir = make_backup_dir(data_dir)?;
    log::info!("备份数据目录到: {:?}", backup_dir);
    backup_directory(data_dir, &backup_dir)?;

    // Step 2: 建表
    log::info!("创建 v1 表结构");
    sqlx::raw_sql(V1_INITIAL_SQL)
        .execute(pool())
        .await
        .map_err(|e| crate::error::AppError::from(format!("建表失败: {}", e)))?;

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

fn make_backup_dir(data_dir: &Path) -> AppResult<PathBuf> {
    let parent = data_dir
        .parent()
        .ok_or_else(|| crate::error::AppError::from("无法定位 data_dir 父目录".to_string()))?;
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    Ok(parent.join(format!("backup_{}", ts)))
}

fn backup_directory(src: &Path, dst: &Path) -> AppResult<()> {
    if !src.exists() {
        // 干净启动，没有数据需要备份
        return Ok(());
    }
    // 目录可能空 —— 仍然创建一个空备份目录，作为"迁移执行过"的证据
    fs::create_dir_all(dst).map_err(|e| crate::error::AppError::from(format!("创建备份目录失败: {}", e)))?;
    copy_dir_recursive(src, dst)?;
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> AppResult<()> {
    for entry in fs::read_dir(src).map_err(|e| crate::error::AppError::from(format!("读取目录 {:?} 失败: {}", src, e)))? {
        let entry = entry.map_err(|e| crate::error::AppError::from(format!("读取条目失败: {}", e)))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let ft = entry
            .file_type()
            .map_err(|e| crate::error::AppError::from(format!("读取类型失败 {:?}: {}", from, e)))?;
        if ft.is_dir() {
            fs::create_dir_all(&to).map_err(|e| crate::error::AppError::from(format!("创建子目录 {:?} 失败: {}", to, e)))?;
            copy_dir_recursive(&from, &to)?;
        } else if ft.is_file() {
            fs::copy(&from, &to).map_err(|e| crate::error::AppError::from(format!("复制 {:?} 失败: {}", from, e)))?;
        }
    }
    Ok(())
}

// ============== 回滚（restore from backup） ==============
//
// 设计：restore 命令不会立即恢复（pool 已经持有连接、Windows 下文件被锁）。
// 它只写一个 .pending_restore=<timestamp> 标记文件，提示用户重启。
// 下次启动时，在 init_db 之前调用 apply_pending_restore() 执行实际恢复：
//   1. 关闭旧 db 文件（删 codeshelf.db / .db-wal / .db-shm）
//   2. 清空 data_dir（保留 .pending_restore flag 自身和 backup_* 父目录无关）
//   3. 把 backup_<ts>/* 复制回 data_dir/
//   4. 删除 .pending_restore flag
// 之后 init_db 创建一个新空库，run_migrations 检测到 schema_version=0
// 重新备份并迁移 —— 完成回滚到那个时间点的状态。

/// 写一个 "下次启动时恢复 backup_<ts>" 的标记。
pub fn schedule_restore(data_dir: &Path, timestamp: &str) -> AppResult<()> {
    let parent = data_dir
        .parent()
        .ok_or_else(|| crate::error::AppError::from("无法定位 data_dir 父目录".to_string()))?;
    let backup_dir = parent.join(format!("backup_{}", timestamp));
    if !backup_dir.exists() {
        return Err(crate::error::AppError::from(format!("备份 {} 不存在", timestamp)));
    }
    fs::create_dir_all(data_dir).map_err(|e| crate::error::AppError::from(format!("创建 data_dir 失败: {}", e)))?;
    let flag = data_dir.join(PENDING_RESTORE_FLAG);
    fs::write(&flag, timestamp).map_err(|e| crate::error::AppError::from(format!("写入 restore 标记失败: {}", e)))?;
    Ok(())
}

/// 在 init_db 之前调用。如果有 pending restore 标记，执行恢复。
pub fn apply_pending_restore(data_dir: &Path) -> AppResult<()> {
    let flag = data_dir.join(PENDING_RESTORE_FLAG);
    if !flag.exists() {
        return Ok(());
    }
    let timestamp = fs::read_to_string(&flag)
        .map_err(|e| crate::error::AppError::from(format!("读取 restore 标记失败: {}", e)))?
        .trim()
        .to_string();
    if timestamp.is_empty() {
        let _ = fs::remove_file(&flag);
        return Err(crate::error::AppError::from("restore 标记内容为空".to_string()));
    }

    let parent = data_dir
        .parent()
        .ok_or_else(|| crate::error::AppError::from("无法定位 data_dir 父目录".to_string()))?;
    let backup_dir = parent.join(format!("backup_{}", timestamp));
    if !backup_dir.exists() {
        let _ = fs::remove_file(&flag);
        return Err(crate::error::AppError::from(format!("备份 {} 已不存在", timestamp)));
    }

    log::warn!("正在从备份 {} 恢复数据 ...", timestamp);

    // 1. 清空 data_dir（包括 codeshelf.db）。flag 自身先备份一下放回去最后删
    clear_dir_keeping(data_dir, &[PENDING_RESTORE_FLAG])?;

    // 2. 把备份的内容复制回去
    copy_dir_recursive(&backup_dir, data_dir)?;

    // 3. 删 flag
    let _ = fs::remove_file(&flag);

    log::warn!("恢复完成。下一步会自动重新执行 v1 迁移。");
    Ok(())
}

/// 列举所有可用备份的时间戳（按新到旧排序）
pub fn list_backup_timestamps(data_dir: &Path) -> AppResult<Vec<String>> {
    let parent = data_dir
        .parent()
        .ok_or_else(|| crate::error::AppError::from("无法定位 data_dir 父目录".to_string()))?;
    if !parent.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(parent).map_err(|e| crate::error::AppError::from(format!("读取备份目录失败: {}", e)))? {
        let entry = entry.map_err(|e| crate::error::AppError::from(format!("读取条目失败: {}", e)))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(ts) = name.strip_prefix("backup_") {
            out.push(ts.to_string());
        }
    }
    out.sort_by(|a, b| b.cmp(a));
    Ok(out)
}

fn clear_dir_keeping(dir: &Path, keep_names: &[&str]) -> AppResult<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| crate::error::AppError::from(format!("读取 data_dir 失败: {}", e)))? {
        let entry = entry.map_err(|e| crate::error::AppError::from(format!("读取条目失败: {}", e)))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if keep_names.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        let ft = entry
            .file_type()
            .map_err(|e| crate::error::AppError::from(format!("读取类型失败 {:?}: {}", path, e)))?;
        if ft.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|e| crate::error::AppError::from(format!("删除目录 {:?} 失败: {}", path, e)))?;
        } else {
            fs::remove_file(&path)
                .map_err(|e| crate::error::AppError::from(format!("删除文件 {:?} 失败: {}", path, e)))?;
        }
    }
    Ok(())
}
