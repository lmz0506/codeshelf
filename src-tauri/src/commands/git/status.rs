// 工作区状态与冲突处理：get_git_status / 冲突相关命令

use super::{
    is_system_junk_file, run_git_command, unquote_git_path, ConflictFileContent, GitStatus,
};
use crate::error::AppResult;

#[tauri::command]
#[specta::specta]
pub async fn get_git_status(path: String) -> AppResult<GitStatus> {
    // Get current branch
    let branch = run_git_command(&path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string());

    // Get status with -uall to show all untracked files recursively
    let status_output = run_git_command(&path, &["status", "--porcelain", "-uall"])?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicted = Vec::new();

    for line in status_output.lines() {
        if line.len() < 3 {
            continue;
        }
        let status = &line[0..2];
        // 跳过状态码后的所有空白字符，更稳健地获取文件路径
        let file_part = line[2..].trim_start();
        let file = unquote_git_path(file_part);

        if file.is_empty() {
            continue;
        }

        if is_system_junk_file(&file) {
            continue;
        }

        if status.contains('U') || matches!(status, "AA" | "DD") {
            conflicted.push(file);
            continue;
        }

        match status.chars().next() {
            Some('?') => untracked.push(file),
            Some(' ') => unstaged.push(file),
            Some(_) => {
                if status.chars().nth(1) == Some(' ') {
                    staged.push(file);
                } else {
                    staged.push(file.clone());
                    unstaged.push(file);
                }
            }
            None => {}
        }
    }

    // Get ahead/behind
    let (ahead, behind) = get_ahead_behind(&path);

    Ok(GitStatus {
        branch,
        is_clean: staged.is_empty()
            && unstaged.is_empty()
            && untracked.is_empty()
            && conflicted.is_empty(),
        staged,
        unstaged,
        untracked,
        conflicted,
        ahead,
        behind,
    })
}

fn get_ahead_behind(path: &str) -> (u32, u32) {
    let output = run_git_command(
        path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    );

    if let Ok(result) = output {
        let parts: Vec<&str> = result.split_whitespace().collect();
        if parts.len() == 2 {
            let ahead = parts[0].parse().unwrap_or(0);
            let behind = parts[1].parse().unwrap_or(0);
            return (ahead, behind);
        }
    }
    (0, 0)
}

fn git_show_stage(path: &str, stage: &str, file: &str) -> Option<String> {
    run_git_command(path, &["show", &format!(":{}:{}", stage, file)]).ok()
}

#[tauri::command]
#[specta::specta]
pub async fn get_conflict_file_content(
    path: String,
    file: String,
) -> AppResult<ConflictFileContent> {
    let worktree = std::fs::read_to_string(std::path::Path::new(&path).join(&file)).ok();
    Ok(ConflictFileContent {
        file: file.clone(),
        base: git_show_stage(&path, "1", &file),
        current: git_show_stage(&path, "2", &file),
        incoming: git_show_stage(&path, "3", &file),
        worktree,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn git_checkout_conflict_version(
    path: String,
    file: String,
    version: String,
) -> AppResult<String> {
    match version.as_str() {
        "ours" => run_git_command(&path, &["checkout", "--ours", "--", &file])?,
        "theirs" => run_git_command(&path, &["checkout", "--theirs", "--", &file])?,
        _ => {
            return Err(crate::error::AppError::from(
                "version 必须是 ours 或 theirs".to_string(),
            ))
        }
    };
    run_git_command(&path, &["add", "--", &file])
}

#[tauri::command]
#[specta::specta]
pub async fn git_mark_resolved(path: String, file: String) -> AppResult<String> {
    run_git_command(&path, &["add", "--", &file])
}
