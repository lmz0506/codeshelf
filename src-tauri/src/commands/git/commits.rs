// 提交历史、详情、文件变更、搜索

use super::{run_git_command, CommitFileChange, CommitInfo};
use crate::error::AppResult;

/// 解析分支/标签引用
fn parse_refs(refs_str: &str) -> Option<Vec<String>> {
    let refs_str = refs_str.trim();
    if refs_str.is_empty() {
        return None;
    }

    let refs: Vec<String> = refs_str
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if refs.is_empty() {
        None
    } else {
        Some(refs)
    }
}

/// 解析父提交哈希
fn parse_parent_hashes(hashes_str: &str) -> Option<Vec<String>> {
    let hashes_str = hashes_str.trim();
    if hashes_str.is_empty() {
        return None;
    }

    let hashes: Vec<String> = hashes_str
        .split_whitespace()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if hashes.is_empty() {
        None
    } else {
        Some(hashes)
    }
}

/// 获取单个提交的统计信息
fn get_commit_stats_sync(path: &str, commit_hash: &str) -> Option<(u32, u32, u32)> {
    let args = vec!["show", "--numstat", "--format=", commit_hash];

    let output = run_git_command(path, &args).ok()?;

    let mut files_changed = 0u32;
    let mut insertions = 0u32;
    let mut deletions = 0u32;

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            files_changed += 1;
            // 解析新增行数 (可能是 "-" 表示二进制文件)
            if let Ok(add) = parts[0].parse::<u32>() {
                insertions += add;
            }
            // 解析删除行数
            if let Ok(del) = parts[1].parse::<u32>() {
                deletions += del;
            }
        }
    }

    Some((files_changed, insertions, deletions))
}

#[tauri::command]
#[specta::specta]
pub async fn get_commit_history(
    path: String,
    limit: Option<u32>,
    ref_name: Option<String>,
) -> AppResult<Vec<CommitInfo>> {
    let limit_str = limit.unwrap_or(50).to_string();

    // 使用 %x1f (Unit Separator) 作为字段分隔符，%x1e (Record Separator) 作为提交分隔符
    // 这样可以避免提交信息中的特殊字符干扰解析
    let format = [
        "%H",  // hash - 完整哈希
        "%h",  // short_hash - 短哈希
        "%s",  // message - 提交标题
        "%an", // author - 作者名
        "%ae", // email - 作者邮箱
        "%aI", // date - ISO 8601 格式日期
        "%b",  // body - 完整提交信息体
        "%D",  // refs - 分支/标签引用
        "%P",  // parent_hashes - 父提交哈希
    ]
    .join("%x1f");

    let mut args = vec![
        "log".to_string(),
        format!("-{}", limit_str),
        format!("--format=%x1e{}", format),
    ];

    // 如果指定了 ref_name（如 origin/main），则获取该引用的提交历史
    if let Some(ref_name) = ref_name {
        args.push(ref_name);
    }

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = run_git_command(&path, &args_ref)?;

    // 解析提交信息
    let commits: Vec<CommitInfo> = output
        .split('\x1e')
        .filter(|s| !s.trim().is_empty())
        .filter_map(|record| {
            let parts: Vec<&str> = record.split('\x1f').collect();
            if parts.len() >= 9 {
                let hash = parts[0].trim().to_string();

                // 获取统计信息
                let stats = get_commit_stats_sync(&path, &hash);

                Some(CommitInfo {
                    hash,
                    short_hash: parts[1].trim().to_string(),
                    message: parts[2].trim().to_string(),
                    author: parts[3].trim().to_string(),
                    email: parts[4].trim().to_string(),
                    date: parts[5].trim().to_string(),
                    body: {
                        let body = parts[6].trim();
                        if body.is_empty() {
                            None
                        } else {
                            Some(body.to_string())
                        }
                    },
                    refs: parse_refs(parts[7]),
                    parent_hashes: parse_parent_hashes(parts[8]),
                    files_changed: stats.map(|s| s.0),
                    insertions: stats.map(|s| s.1),
                    deletions: stats.map(|s| s.2),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}

/// 获取单个提交的详细信息（用于按需加载）
#[tauri::command]
#[specta::specta]
pub async fn get_commit_detail(path: String, commit_hash: String) -> AppResult<CommitInfo> {
    let format = ["%H", "%h", "%s", "%an", "%ae", "%aI", "%b", "%D", "%P"].join("%x1f");

    let args = vec!["show", "--format", &format, "-s", &commit_hash];
    let output = run_git_command(&path, &args)?;

    let parts: Vec<&str> = output.trim().split('\x1f').collect();
    if parts.len() < 9 {
        return Err(crate::error::AppError::from(
            "Invalid commit format".to_string(),
        ));
    }

    let stats = get_commit_stats_sync(&path, &commit_hash);

    Ok(CommitInfo {
        hash: parts[0].trim().to_string(),
        short_hash: parts[1].trim().to_string(),
        message: parts[2].trim().to_string(),
        author: parts[3].trim().to_string(),
        email: parts[4].trim().to_string(),
        date: parts[5].trim().to_string(),
        body: {
            let body = parts[6].trim();
            if body.is_empty() {
                None
            } else {
                Some(body.to_string())
            }
        },
        refs: parse_refs(parts[7]),
        parent_hashes: parse_parent_hashes(parts[8]),
        files_changed: stats.map(|s| s.0),
        insertions: stats.map(|s| s.1),
        deletions: stats.map(|s| s.2),
    })
}

/// 获取提交的文件变更列表
#[tauri::command]
#[specta::specta]
pub async fn get_commit_files(
    path: String,
    commit_hash: String,
) -> AppResult<Vec<CommitFileChange>> {
    let args = vec!["show", "--numstat", "--format=", commit_hash.as_str()];

    let output = run_git_command(&path, &args)?;

    let files: Vec<CommitFileChange> = output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }

            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                Some(CommitFileChange {
                    insertions: parts[0].parse().unwrap_or(0),
                    deletions: parts[1].parse().unwrap_or(0),
                    filename: parts[2..].join("\t"),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(files)
}

/// 搜索提交历史
#[tauri::command]
#[specta::specta]
pub async fn search_commits(
    path: String,
    query: String,
    search_type: Option<String>,
    limit: Option<u32>,
) -> AppResult<Vec<CommitInfo>> {
    let limit_str = limit.unwrap_or(50).to_string();
    let format = ["%H", "%h", "%s", "%an", "%ae", "%aI", "%b", "%D", "%P"].join("%x1f");

    let mut args = vec![
        "log".to_string(),
        format!("-{}", limit_str),
        format!("--format=%x1e{}", format),
    ];

    // 根据搜索类型添加参数
    match search_type.as_deref() {
        Some("author") => {
            args.push(format!("--author={}", query));
        }
        Some("message") => {
            args.push(format!("--grep={}", query));
        }
        Some("hash") => {
            // 直接查找特定提交
            return get_commit_detail(path, query).await.map(|c| vec![c]);
        }
        _ => {
            // 默认搜索提交信息
            args.push(format!("--grep={}", query));
        }
    }

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = run_git_command(&path, &args_ref)?;

    let commits: Vec<CommitInfo> = output
        .split('\x1e')
        .filter(|s| !s.trim().is_empty())
        .filter_map(|record| {
            let parts: Vec<&str> = record.split('\x1f').collect();
            if parts.len() >= 9 {
                Some(CommitInfo {
                    hash: parts[0].trim().to_string(),
                    short_hash: parts[1].trim().to_string(),
                    message: parts[2].trim().to_string(),
                    author: parts[3].trim().to_string(),
                    email: parts[4].trim().to_string(),
                    date: parts[5].trim().to_string(),
                    body: {
                        let body = parts[6].trim();
                        if body.is_empty() {
                            None
                        } else {
                            Some(body.to_string())
                        }
                    },
                    refs: parse_refs(parts[7]),
                    parent_hashes: parse_parent_hashes(parts[8]),
                    files_changed: None,
                    insertions: None,
                    deletions: None,
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}
