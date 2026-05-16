// SSH 隧道 Tauri 命令：CRUD + start/stop + get + stats + list_hosts

use std::sync::Arc;

use tokio::sync::Mutex;
use tokio::time::Duration;

use super::super::{current_time, generate_id, SshAuthMethod, SshTunnel, SshTunnelInput, SshTunnelStats};
use super::auth::{connect_and_authenticate, list_host_aliases_from_config};
use super::runtime::{run_tunnel_server, update_tunnel_stats};
use super::{
    ensure_tunnels_loaded, save_tunnels_to_file, SshTunnelController, SSH_CONTROLLERS, SSH_TUNNELS,
};

#[tauri::command]
pub async fn add_ssh_tunnel(input: SshTunnelInput) -> Result<SshTunnel, String> {
    ensure_tunnels_loaded().await;

    if input.local_port == 0 {
        return Err("本地端口不能为 0".to_string());
    }
    if input.remote_port == 0 {
        return Err("远程端口不能为 0".to_string());
    }
    if input.remote_host.is_empty() {
        return Err("远程主机不能为空".to_string());
    }
    if matches!(&input.auth, SshAuthMethod::SshConfig { host_alias } if host_alias.is_empty()) {
        return Err("SSH config Host 别名不能为空".to_string());
    }

    {
        let tunnels = SSH_TUNNELS.lock().await;
        for t in tunnels.values() {
            if t.local_port == input.local_port && t.status == "running" {
                return Err(format!("端口 {} 已被其他隧道使用", input.local_port));
            }
        }
    }

    let id = generate_id();
    let tunnel = SshTunnel {
        id: id.clone(),
        name: input.name,
        local_port: input.local_port,
        remote_host: input.remote_host,
        remote_port: input.remote_port,
        ssh_host: input.ssh_host,
        ssh_port: input.ssh_port.unwrap_or(22),
        ssh_user: input.ssh_user.unwrap_or_default(),
        auth: input.auth,
        status: "stopped".to_string(),
        connections: 0,
        bytes_in: 0,
        bytes_out: 0,
        last_error: None,
        created_at: current_time(),
    };

    {
        let mut tunnels = SSH_TUNNELS.lock().await;
        tunnels.insert(id.clone(), tunnel.clone());
    }

    if let Err(e) = save_tunnels_to_file().await {
        log::error!("保存 SSH 隧道失败: {}", e);
        let mut tunnels = SSH_TUNNELS.lock().await;
        tunnels.remove(&id);
        return Err(format!("保存 SSH 隧道失败: {}", e));
    }

    Ok(tunnel)
}

#[tauri::command]
pub async fn update_ssh_tunnel(
    tunnel_id: String,
    input: SshTunnelInput,
) -> Result<SshTunnel, String> {
    ensure_tunnels_loaded().await;

    let old = {
        let tunnels = SSH_TUNNELS.lock().await;
        tunnels.get(&tunnel_id).cloned()
    };
    let old = old.ok_or_else(|| format!("隧道不存在: {}", tunnel_id))?;

    if old.status == "running" {
        stop_ssh_tunnel(tunnel_id.clone()).await?;
    }

    {
        let mut tunnels = SSH_TUNNELS.lock().await;
        if let Some(t) = tunnels.get_mut(&tunnel_id) {
            t.name = input.name;
            t.local_port = input.local_port;
            t.remote_host = input.remote_host;
            t.remote_port = input.remote_port;
            t.ssh_host = input.ssh_host;
            t.ssh_port = input.ssh_port.unwrap_or(22);
            t.ssh_user = input.ssh_user.unwrap_or_default();
            t.auth = input.auth;
            t.last_error = None;
        }
    }

    if let Err(e) = save_tunnels_to_file().await {
        log::error!("保存 SSH 隧道失败: {}", e);
        let mut tunnels = SSH_TUNNELS.lock().await;
        tunnels.insert(tunnel_id.clone(), old);
        return Err(format!("保存 SSH 隧道失败: {}", e));
    }

    let tunnels = SSH_TUNNELS.lock().await;
    tunnels
        .get(&tunnel_id)
        .cloned()
        .ok_or_else(|| "隧道不存在".to_string())
}

#[tauri::command]
pub async fn remove_ssh_tunnel(tunnel_id: String) -> Result<(), String> {
    ensure_tunnels_loaded().await;

    let _ = stop_ssh_tunnel(tunnel_id.clone()).await;

    let old = {
        let tunnels = SSH_TUNNELS.lock().await;
        tunnels.get(&tunnel_id).cloned()
    };

    {
        let mut tunnels = SSH_TUNNELS.lock().await;
        tunnels.remove(&tunnel_id);
    }

    if let Err(e) = save_tunnels_to_file().await {
        if let Some(t) = old {
            let mut tunnels = SSH_TUNNELS.lock().await;
            tunnels.insert(tunnel_id, t);
        }
        return Err(format!("保存 SSH 隧道失败: {}", e));
    }

    Ok(())
}

#[tauri::command]
pub async fn start_ssh_tunnel(tunnel_id: String) -> Result<(), String> {
    ensure_tunnels_loaded().await;

    let tunnel = {
        let tunnels = SSH_TUNNELS.lock().await;
        tunnels.get(&tunnel_id).cloned()
    };
    let tunnel = tunnel.ok_or_else(|| format!("隧道不存在: {}", tunnel_id))?;

    if tunnel.status == "running" {
        return Err("隧道已在运行中".to_string());
    }

    // 先清除 last_error
    {
        let mut tunnels = SSH_TUNNELS.lock().await;
        if let Some(t) = tunnels.get_mut(&tunnel_id) {
            t.last_error = None;
        }
    }

    // 连接 + 认证（失败立即返回）
    let handle = connect_and_authenticate(&tunnel)
        .await
        .map_err(|e| {
            // 记录错误
            let id = tunnel_id.clone();
            let err = e.clone();
            tokio::spawn(async move {
                let mut tunnels = SSH_TUNNELS.lock().await;
                if let Some(t) = tunnels.get_mut(&id) {
                    t.last_error = Some(err);
                }
            });
            e
        })?;

    let controller = Arc::new(SshTunnelController::new());

    {
        let mut controllers = SSH_CONTROLLERS.lock().await;
        controllers.insert(tunnel_id.clone(), controller.clone());
    }

    {
        let mut tunnels = SSH_TUNNELS.lock().await;
        if let Some(t) = tunnels.get_mut(&tunnel_id) {
            t.status = "running".to_string();
        }
    }

    let ssh_handle = Arc::new(Mutex::new(handle));
    let id = tunnel_id.clone();
    let local_port = tunnel.local_port;
    let remote_host = tunnel.remote_host.clone();
    let remote_port = tunnel.remote_port;

    tokio::spawn(async move {
        if let Err(e) = run_tunnel_server(
            id.clone(),
            local_port,
            remote_host,
            remote_port,
            ssh_handle.clone(),
            controller,
        )
        .await
        {
            log::error!("SSH 隧道服务错误: {}", e);
            let mut tunnels = SSH_TUNNELS.lock().await;
            if let Some(t) = tunnels.get_mut(&id) {
                t.last_error = Some(e);
            }
        }

        // 关闭 SSH 会话
        {
            let h = ssh_handle.lock().await;
            let _ = h.disconnect(russh::Disconnect::ByApplication, "", "en").await;
        }

        // 状态置回 stopped
        let mut tunnels = SSH_TUNNELS.lock().await;
        if let Some(t) = tunnels.get_mut(&id) {
            t.status = "stopped".to_string();
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_ssh_tunnel(tunnel_id: String) -> Result<(), String> {
    log::info!("停止 SSH 隧道: {}", tunnel_id);

    {
        let controllers = SSH_CONTROLLERS.lock().await;
        if let Some(controller) = controllers.get(&tunnel_id) {
            controller.stop();
        }
    }

    {
        let mut tunnels = SSH_TUNNELS.lock().await;
        if let Some(t) = tunnels.get_mut(&tunnel_id) {
            t.status = "stopped".to_string();
        }
    }

    {
        let mut controllers = SSH_CONTROLLERS.lock().await;
        controllers.remove(&tunnel_id);
    }

    tokio::time::sleep(Duration::from_millis(50)).await;
    Ok(())
}

#[tauri::command]
pub async fn get_ssh_tunnels() -> Result<Vec<SshTunnel>, String> {
    ensure_tunnels_loaded().await;

    let ids: Vec<String> = {
        let tunnels = SSH_TUNNELS.lock().await;
        tunnels
            .values()
            .filter(|t| t.status == "running")
            .map(|t| t.id.clone())
            .collect()
    };
    for id in ids {
        update_tunnel_stats(&id).await;
    }

    let tunnels = SSH_TUNNELS.lock().await;
    Ok(tunnels.values().cloned().collect())
}

#[tauri::command]
pub async fn get_ssh_tunnel(tunnel_id: String) -> Result<Option<SshTunnel>, String> {
    ensure_tunnels_loaded().await;
    update_tunnel_stats(&tunnel_id).await;
    let tunnels = SSH_TUNNELS.lock().await;
    Ok(tunnels.get(&tunnel_id).cloned())
}

#[tauri::command]
pub async fn get_ssh_tunnel_stats(tunnel_id: String) -> Result<SshTunnelStats, String> {
    let controllers = SSH_CONTROLLERS.lock().await;
    let (connections, bytes_in, bytes_out) = controllers
        .get(&tunnel_id)
        .map(|c| c.get_stats())
        .unwrap_or((0, 0, 0));
    Ok(SshTunnelStats {
        tunnel_id,
        connections,
        bytes_in,
        bytes_out,
    })
}

#[tauri::command]
pub async fn list_ssh_config_hosts() -> Result<Vec<String>, String> {
    Ok(list_host_aliases_from_config())
}
