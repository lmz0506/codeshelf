// 暂存/还原/stash/commit/revert/cherry-pick

use crate::error::AppResult;
use super::{is_system_junk_file, run_git_command};

#[tauri::command]
#[specta::specta]
pub async fn git_add(path: String, files: Vec<String>) -> AppResult<String> {
    if files.is_empty() {
        // Add all changes while keeping macOS Finder metadata out of commits,
        // even when the target project has not configured its own .gitignore.
        run_git_command(&path, &["add", "-A", "--", ".", ":(exclude).DS_Store", ":(exclude)**/.DS_Store"])
    } else {
        // Add specific files
        let files_to_add: Vec<String> = files
            .into_iter()
            .filter(|file| !is_system_junk_file(file))
            .collect();
        if files_to_add.is_empty() {
            Ok("没有需要暂存的文件".to_string())
        } else {
            let mut args = vec!["add", "--"];
            args.extend(files_to_add.iter().map(|s| s.as_str()));
            run_git_command(&path, &args)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn git_unstage(path: String, files: Vec<String>) -> AppResult<String> {
    if files.is_empty() {
        run_git_command(&path, &["reset", "HEAD"])
    } else {
        let mut args = vec!["reset", "HEAD", "--"];
        args.extend(files.iter().map(|s| s.as_str()));
        run_git_command(&path, &args)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn git_discard_files(path: String, files: Vec<String>, include_untracked: bool) -> AppResult<String> {
    if files.is_empty() {
        return Err(crate::error::AppError::from("请选择要丢弃的文件".to_string()));
    }

    if include_untracked {
        let mut args = vec!["clean", "-f", "--"];
        args.extend(files.iter().map(|s| s.as_str()));
        run_git_command(&path, &args)
    } else {
        let mut args = vec!["restore", "--staged", "--worktree", "--"];
        args.extend(files.iter().map(|s| s.as_str()));
        run_git_command(&path, &args)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn git_stash_push(path: String, message: Option<String>) -> AppResult<String> {
    let label = message
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| "CodeShelf stash".to_string());
    run_git_command(&path, &["stash", "push", "-u", "-m", &label])
}

#[tauri::command]
#[specta::specta]
pub async fn git_stash_pop(path: String) -> AppResult<String> {
    run_git_command(&path, &["stash", "pop"])
}

#[tauri::command]
#[specta::specta]
pub async fn git_stash_apply(path: String) -> AppResult<String> {
    run_git_command(&path, &["stash", "apply"])
}

#[tauri::command]
#[specta::specta]
pub async fn git_revert_commit(path: String, commit_hash: String) -> AppResult<String> {
    run_git_command(&path, &["revert", "--no-edit", &commit_hash])
}

#[tauri::command]
#[specta::specta]
pub async fn git_cherry_pick(path: String, commit_hash: String) -> AppResult<String> {
    run_git_command(&path, &["cherry-pick", &commit_hash])
}

#[tauri::command]
#[specta::specta]
pub async fn git_commit(path: String, message: String) -> AppResult<String> {
    if message.trim().is_empty() {
        return Err(crate::error::AppError::from("提交信息不能为空".to_string()));
    }
    run_git_command(&path, &["commit", "-m", &message])
}

#[tauri::command]
#[specta::specta]
pub async fn git_add_and_commit(path: String, files: Vec<String>, message: String) -> AppResult<String> {
    if message.trim().is_empty() {
        return Err(crate::error::AppError::from("提交信息不能为空".to_string()));
    }

    // First add files
    git_add(path.clone(), files).await?;

    // Then commit
    git_commit(path, message).await
}
