// 分支命令：get_branches / checkout_branch / create_branch

use crate::error::AppResult;
use super::{run_git_command, BranchInfo};

#[tauri::command]
#[specta::specta]
pub async fn get_branches(path: String) -> AppResult<Vec<BranchInfo>> {
    let output = run_git_command(&path, &["branch", "-a", "-vv"])?;

    let branches: Vec<BranchInfo> = output
        .lines()
        .map(|line| {
            let is_current = line.starts_with('*');
            let line = line.trim_start_matches(['*', ' '].as_ref());
            let parts: Vec<&str> = line.split_whitespace().collect();

            let name = parts.first().unwrap_or(&"").to_string();
            let is_remote = name.starts_with("remotes/");

            // Extract upstream from [origin/branch] format
            let upstream = line
                .find('[')
                .and_then(|start| {
                    line[start..].find(']').map(|end| {
                        line[start + 1..start + end].split(':').next().unwrap_or("").to_string()
                    })
                });

            BranchInfo {
                name: name.trim_start_matches("remotes/").to_string(),
                is_current,
                is_remote,
                upstream,
            }
        })
        .collect();

    Ok(branches)
}

#[tauri::command]
#[specta::specta]
pub async fn checkout_branch(path: String, branch: String) -> AppResult<String> {
    run_git_command(&path, &["checkout", &branch])
}

#[tauri::command]
#[specta::specta]
pub async fn create_branch(path: String, branch: String, checkout: bool) -> AppResult<String> {
    if checkout {
        // Create and checkout the new branch
        run_git_command(&path, &["checkout", "-b", &branch])
    } else {
        // Just create the branch without checking out
        run_git_command(&path, &["branch", &branch])
    }
}
