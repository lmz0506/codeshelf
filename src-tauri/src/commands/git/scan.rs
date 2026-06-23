// 仓库扫描与初始化：scan_directory / is_git_repo / git_init

use super::{run_git_command, GitRepo};
use crate::error::AppResult;

#[tauri::command]
#[specta::specta]
pub async fn scan_directory(path: String, depth: Option<u32>) -> AppResult<Vec<GitRepo>> {
    let mut repos = Vec::new();
    let scan_depth = depth.unwrap_or(3);
    scan_for_repos(&path, &mut repos, scan_depth)?;
    Ok(repos)
}

fn scan_for_repos(path: &str, repos: &mut Vec<GitRepo>, depth: u32) -> AppResult<()> {
    if depth == 0 {
        return Ok(());
    }

    let entries =
        std::fs::read_dir(path).map_err(|e| crate::error::AppError::from(e.to_string()))?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            let Some(file_name) = entry_path.file_name() else {
                continue;
            };
            let dir_name = file_name.to_string_lossy().to_string();

            // Skip hidden directories except .git
            if dir_name.starts_with('.') && dir_name != ".git" {
                continue;
            }

            if dir_name == ".git" {
                // Found a git repo, add the parent directory
                if let Some(parent) = entry_path.parent() {
                    let repo_name = parent
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "Unknown".to_string());
                    repos.push(GitRepo {
                        path: parent.to_string_lossy().to_string(),
                        name: repo_name,
                    });
                }
            } else {
                // Continue scanning subdirectories
                scan_for_repos(&entry_path.to_string_lossy(), repos, depth - 1)?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn is_git_repo(path: String) -> AppResult<bool> {
    let git_dir = std::path::Path::new(&path).join(".git");
    Ok(git_dir.exists())
}

#[tauri::command]
#[specta::specta]
pub async fn git_init(path: String) -> AppResult<String> {
    run_git_command(&path, &["init"])
}
