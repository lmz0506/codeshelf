//! CopyFile / MoveFile / DeleteFile —— 任意路径下的文件/目录复制移动删除。
//! 跨平台拒绝删除根/系统目录。

use crate::error::AppResult;
use std::fs;
use std::path::Path;

use serde_json::Value;

use super::ctx::expand_home;

fn copy_recursively(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let dest = dst.join(entry.file_name());
            copy_recursively(&entry.path(), &dest)?;
        }
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(src, dst)?;
    }
    Ok(())
}

pub(super) fn tool_copy_file(args: &Value) -> AppResult<String> {
    let src = args.get("src").and_then(|v| v.as_str()).ok_or("缺少 src")?;
    let dst = args.get("dst").and_then(|v| v.as_str()).ok_or("缺少 dst")?;
    let src = expand_home(src);
    let dst = expand_home(dst);
    let overwrite = args.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(false);
    let src_p = Path::new(&src);
    let dst_p = Path::new(&dst);
    if !src_p.exists() {
        return Err(crate::error::AppError::from(format!("源不存在：{}", src)));
    }
    if dst_p.exists() && !overwrite {
        return Err(crate::error::AppError::from(format!("目标已存在（传 overwrite=true 覆盖）：{}", dst)));
    }
    if dst_p.exists() && overwrite {
        if dst_p.is_dir() {
            fs::remove_dir_all(dst_p).map_err(|e| crate::error::AppError::from(e.to_string()))?;
        } else {
            fs::remove_file(dst_p).map_err(|e| crate::error::AppError::from(e.to_string()))?;
        }
    }
    copy_recursively(src_p, dst_p).map_err(|e| crate::error::AppError::from(format!("复制失败: {}", e)))?;
    Ok(format!("已复制 {} → {}", src, dst))
}

pub(super) fn tool_move_file(args: &Value) -> AppResult<String> {
    let src = args.get("src").and_then(|v| v.as_str()).ok_or("缺少 src")?;
    let dst = args.get("dst").and_then(|v| v.as_str()).ok_or("缺少 dst")?;
    let src = expand_home(src);
    let dst = expand_home(dst);
    let overwrite = args.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(false);
    let src_p = Path::new(&src);
    let dst_p = Path::new(&dst);
    if !src_p.exists() {
        return Err(crate::error::AppError::from(format!("源不存在：{}", src)));
    }
    if dst_p.exists() && !overwrite {
        return Err(crate::error::AppError::from(format!("目标已存在（传 overwrite=true 覆盖）：{}", dst)));
    }
    if dst_p.exists() && overwrite {
        if dst_p.is_dir() {
            fs::remove_dir_all(dst_p).map_err(|e| crate::error::AppError::from(e.to_string()))?;
        } else {
            fs::remove_file(dst_p).map_err(|e| crate::error::AppError::from(e.to_string()))?;
        }
    }
    match fs::rename(src_p, dst_p) {
        Ok(_) => Ok(format!("已移动 {} → {}", src, dst)),
        Err(_) => {
            // 跨盘：fallback copy + delete
            copy_recursively(src_p, dst_p).map_err(|e| crate::error::AppError::from(format!("跨盘复制失败: {}", e)))?;
            if src_p.is_dir() {
                fs::remove_dir_all(src_p).map_err(|e| crate::error::AppError::from(format!("删除源失败: {}", e)))?;
            } else {
                fs::remove_file(src_p).map_err(|e| crate::error::AppError::from(format!("删除源失败: {}", e)))?;
            }
            Ok(format!("已跨盘移动 {} → {}", src, dst))
        }
    }
}

pub(super) fn tool_delete_file(args: &Value) -> AppResult<String> {
    let path = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let path = expand_home(path);
    let recursive = args.get("recursive").and_then(|v| v.as_bool()).unwrap_or(false);
    let p = Path::new(&path);
    if !p.exists() {
        return Err(crate::error::AppError::from(format!("路径不存在：{}", path)));
    }

    // 跨平台受保护路径（大小写不敏感比较）
    let norm = path.trim_end_matches(&['/', '\\'][..]).to_lowercase();
    let dangerous: &[&str] = &[
        // unix
        "/", "/users", "/home", "/etc", "/usr", "/var", "/bin", "/sbin",
        "/system", "/library", "/opt", "/private", "/tmp",
        // windows
        "c:", "c:\\", "c:\\windows", "c:\\program files", "c:\\program files (x86)",
        "c:\\users", "c:\\programdata", "d:", "d:\\",
    ];
    if dangerous.iter().any(|d| norm == *d) {
        return Err(crate::error::AppError::from(format!("拒绝删除受保护路径：{}", path)));
    }
    // 再拒绝 drive root（Windows 任意盘根）
    if cfg!(windows) && norm.len() <= 3 && norm.ends_with(":\\") {
        return Err(crate::error::AppError::from(format!("拒绝删除盘根：{}", path)));
    }

    if p.is_dir() {
        if !recursive {
            return Err("删除目录需要 recursive=true".into());
        }
        fs::remove_dir_all(p).map_err(|e| crate::error::AppError::from(format!("删除失败: {}", e)))?;
    } else {
        fs::remove_file(p).map_err(|e| crate::error::AppError::from(format!("删除失败: {}", e)))?;
    }
    Ok(format!("已删除：{}", path))
}
