// git clone 与取消：包含进度解析、子进程管理

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex as StdMutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::GitCloneProgress;

#[cfg(target_os = "windows")]
use super::CREATE_NO_WINDOW;

// Git clone progress management
static CLONE_PID: StdMutex<Option<u32>> = StdMutex::new(None);
static CLONE_CANCELLED: AtomicBool = AtomicBool::new(false);

fn parse_clone_progress(line: &str) -> Option<GitCloneProgress> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    if let Some(percent_pos) = line.find('%') {
        let before = &line[..percent_pos];
        let num_start = before
            .rfind(|c: char| !c.is_ascii_digit())
            .map(|i| i + 1)
            .unwrap_or(0);
        let percent: i32 = before[num_start..].parse().unwrap_or(-1);

        let phase = if line.contains("Counting") {
            "counting"
        } else if line.contains("Compressing") {
            "compressing"
        } else if line.contains("Receiving") {
            "receiving"
        } else if line.contains("Resolving") {
            "resolving"
        } else {
            "unknown"
        };

        Some(GitCloneProgress {
            phase: phase.to_string(),
            percent,
            message: line.to_string(),
        })
    } else if line.contains("Cloning into") {
        Some(GitCloneProgress {
            phase: "cloning".to_string(),
            percent: 0,
            message: line.to_string(),
        })
    } else if line.contains("Enumerating") {
        Some(GitCloneProgress {
            phase: "enumerating".to_string(),
            percent: -1,
            message: line.to_string(),
        })
    } else {
        None
    }
}

fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[tauri::command]
pub async fn git_clone(
    app: tauri::AppHandle,
    url: String,
    target_dir: String,
    repo_name: String,
) -> Result<String, String> {
    use std::path::PathBuf;
    use std::io::BufReader;
    use tauri::Emitter;

    let target_path = PathBuf::from(&target_dir).join(&repo_name);
    let target_path_str = target_path.to_string_lossy().to_string();

    if target_path.exists() {
        return Err(format!("目录 '{}' 已存在", repo_name));
    }

    // Check if another clone is in progress
    {
        let guard = CLONE_PID.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("另一个克隆操作正在进行中".to_string());
        }
    }

    // Reset cancel flag
    CLONE_CANCELLED.store(false, Ordering::SeqCst);

    // Emit initial progress
    let _ = app.emit("git-clone-progress", GitCloneProgress {
        phase: "cloning".to_string(),
        percent: 0,
        message: "准备克隆...".to_string(),
    });

    // Spawn clone process with --progress flag
    #[cfg(target_os = "windows")]
    let mut child = Command::new("git")
        .args(["clone", "--progress", &url, &target_path_str])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 git clone 失败: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("git")
        .args(["clone", "--progress", &url, &target_path_str])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 git clone 失败: {}", e))?;

    // Store PID for cancellation
    let pid = child.id();
    {
        let mut guard = CLONE_PID.lock().map_err(|e| e.to_string())?;
        *guard = Some(pid);
    }

    // Read progress from stderr (git sends progress via \r-delimited lines)
    let mut last_error_line = String::new();
    if let Some(stderr) = child.stderr.take() {
        let mut reader = BufReader::new(stderr);
        let mut buf = vec![0u8; 512];
        let mut line = String::new();

        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    for &byte in &buf[..n] {
                        if byte == b'\r' || byte == b'\n' {
                            if !line.is_empty() {
                                if let Some(progress) = parse_clone_progress(&line) {
                                    let _ = app.emit("git-clone-progress", progress);
                                }
                                last_error_line = line.clone();
                                line.clear();
                            }
                        } else {
                            line.push(byte as char);
                        }
                    }
                }
                Err(_) => break,
            }
        }

        if !line.is_empty() {
            if let Some(progress) = parse_clone_progress(&line) {
                let _ = app.emit("git-clone-progress", progress);
            }
            last_error_line = line;
        }
    }

    // Wait for process to complete
    let status = child.wait().map_err(|e| format!("等待克隆完成失败: {}", e))?;

    // Clear PID
    {
        let mut guard = CLONE_PID.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    // Check if cancelled
    if CLONE_CANCELLED.load(Ordering::SeqCst) {
        if target_path.exists() {
            let _ = std::fs::remove_dir_all(&target_path);
        }
        return Err("克隆已取消".to_string());
    }

    if status.success() {
        Ok(target_path_str)
    } else {
        if target_path.exists() {
            let _ = std::fs::remove_dir_all(&target_path);
        }
        if last_error_line.is_empty() {
            Err("克隆失败".to_string())
        } else {
            Err(last_error_line)
        }
    }
}

#[tauri::command]
pub async fn cancel_git_clone() -> Result<(), String> {
    CLONE_CANCELLED.store(true, Ordering::SeqCst);

    let pid = {
        let guard = CLONE_PID.lock().map_err(|e| e.to_string())?;
        *guard
    };

    if let Some(pid) = pid {
        kill_process_tree(pid);
    }

    Ok(())
}
