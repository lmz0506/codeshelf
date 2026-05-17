//! Bash 工具：在 allowedCwd 中执行 shell。Unix 用 /bin/sh -c，Windows 用 cmd /C。

use crate::error::AppResult;
use std::fs;
use std::time::Duration;

use serde_json::Value;
use tokio::process::Command;
use tokio::time::timeout as tokio_timeout;

use super::ctx::{truncate, ToolCtx};

pub(super) async fn tool_bash(ctx: &ToolCtx, args: &Value) -> AppResult<String> {
    let command = args
        .get("command")
        .and_then(|v| v.as_str())
        .ok_or("缺少 command")?;
    let timeout_ms = args.get("timeout").and_then(|v| v.as_u64()).unwrap_or(60_000);
    let base = ctx
        .allowed_cwd
        .as_ref()
        .ok_or("会话未设置 allowedCwd")?;
    let base_canon = fs::canonicalize(base).map_err(|e| crate::error::AppError::from(format!("allowedCwd 无效: {}", e)))?;

    #[cfg(target_family = "unix")]
    let mut cmd = {
        let mut c = Command::new("/bin/sh");
        c.arg("-c").arg(command);
        c
    };
    #[cfg(target_family = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(command);
        c
    };
    cmd.current_dir(&base_canon);
    cmd.kill_on_drop(true);

    let fut = cmd.output();
    let output = tokio_timeout(Duration::from_millis(timeout_ms), fut)
        .await
        .map_err(|_| crate::error::AppError::from(format!("命令超时（{} ms）", timeout_ms)))?
        .map_err(|e| crate::error::AppError::from(format!("执行失败: {}", e)))?;

    let mut out = String::new();
    out.push_str(&format!("exit: {}\n", output.status.code().unwrap_or(-1)));
    if !output.stdout.is_empty() {
        out.push_str("---stdout---\n");
        out.push_str(&String::from_utf8_lossy(&output.stdout));
        out.push('\n');
    }
    if !output.stderr.is_empty() {
        out.push_str("---stderr---\n");
        out.push_str(&String::from_utf8_lossy(&output.stderr));
        out.push('\n');
    }
    Ok(truncate(out, 50_000))
}
