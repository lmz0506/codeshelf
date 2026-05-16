// SSH 隧道模块 - 等价 `ssh -N -L localPort:remoteHost:remotePort user@sshHost`
// 底层使用 russh 纯 Rust 客户端实现，支持私钥/密码/读取 ~/.ssh/config 三种认证方式
//
// 子模块：
// - auth:      解析 ssh_config 与 connect_and_authenticate
// - runtime:   监听本地端口并转发到 SSH
// - commands:  Tauri 命令（CRUD + start/stop + get + stats + list_hosts）
// - port_test: 端口连通性测试命令与跨平台实现

use super::SshTunnel;
use crate::storage;
use once_cell::sync::Lazy;
use russh::client;
use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

mod auth;
mod commands;
mod port_test;
mod runtime;

pub use commands::*;
pub use port_test::*;

/// 隧道存储
pub(super) static SSH_TUNNELS: Lazy<Arc<Mutex<HashMap<String, SshTunnel>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 是否已加载
pub(super) static TUNNELS_LOADED: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

/// 控制器（用于停止）
pub(super) static SSH_CONTROLLERS: Lazy<Arc<Mutex<HashMap<String, Arc<SshTunnelController>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 隧道控制器
pub(super) struct SshTunnelController {
    stop: AtomicBool,
    connections: AtomicU32,
    bytes_in: AtomicU64,
    bytes_out: AtomicU64,
}

impl SshTunnelController {
    pub(super) fn new() -> Self {
        Self {
            stop: AtomicBool::new(false),
            connections: AtomicU32::new(0),
            bytes_in: AtomicU64::new(0),
            bytes_out: AtomicU64::new(0),
        }
    }

    pub(super) fn is_stopped(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }

    pub(super) fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    pub(super) fn inc_connections(&self) {
        self.connections.fetch_add(1, Ordering::SeqCst);
    }

    pub(super) fn dec_connections(&self) {
        self.connections.fetch_sub(1, Ordering::SeqCst);
    }

    pub(super) fn add_bytes_in(&self, n: u64) {
        self.bytes_in.fetch_add(n, Ordering::SeqCst);
    }

    pub(super) fn add_bytes_out(&self, n: u64) {
        self.bytes_out.fetch_add(n, Ordering::SeqCst);
    }

    pub(super) fn get_stats(&self) -> (u32, u64, u64) {
        (
            self.connections.load(Ordering::SeqCst),
            self.bytes_in.load(Ordering::SeqCst),
            self.bytes_out.load(Ordering::SeqCst),
        )
    }
}

/// russh 客户端 handler - 接受任意 host key（首版不校验 known_hosts）
pub(super) struct SshClient;

impl client::Handler for SshClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ============== 持久化 ==============

pub(super) async fn ensure_tunnels_loaded() {
    let mut loaded = TUNNELS_LOADED.lock().await;
    if !*loaded {
        match load_tunnels_from_file() {
            Ok(map) => {
                let mut tunnels = SSH_TUNNELS.lock().await;
                *tunnels = map;
                *loaded = true;
            }
            Err(e) => {
                log::warn!("加载 SSH 隧道失败，将在下次重试: {}", e);
            }
        }
    }
}

fn load_tunnels_from_file() -> Result<HashMap<String, SshTunnel>, String> {
    let config = storage::get_storage_config()?;
    let path = config.ssh_tunnels_file();

    log::info!("加载 SSH 隧道: {:?}", path);

    if !path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("读取 SSH 隧道失败: {}", e))?;

    let arr: Vec<SshTunnel> = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            log::error!(
                "解析 SSH 隧道 JSON 失败: {}, 内容: {}",
                e,
                &content[..content.len().min(200)]
            );
            Vec::new()
        }
    };

    let mut map = HashMap::new();
    for mut t in arr {
        t.status = "stopped".to_string();
        t.connections = 0;
        t.bytes_in = 0;
        t.bytes_out = 0;
        t.last_error = None;
        log::info!(
            "加载 SSH 隧道: {} (:{}→{}@{}:{}→{}:{})",
            t.name,
            t.local_port,
            t.ssh_user,
            t.ssh_host,
            t.ssh_port,
            t.remote_host,
            t.remote_port
        );
        map.insert(t.id.clone(), t);
    }

    log::info!("共加载 {} 个 SSH 隧道", map.len());
    Ok(map)
}

pub(super) async fn save_tunnels_to_file() -> Result<(), String> {
    let config = storage::get_storage_config()?;
    config.ensure_dirs()?;

    let tunnels = SSH_TUNNELS.lock().await;
    let data: Vec<&SshTunnel> = tunnels.values().collect();
    let content = serde_json::to_string(&data).map_err(|e| format!("序列化 SSH 隧道失败: {}", e))?;

    let path = config.ssh_tunnels_file();
    fs::write(&path, content).map_err(|e| format!("写入 SSH 隧道失败: {}", e))?;

    log::info!("SSH 隧道保存成功，共 {} 个", tunnels.len());
    Ok(())
}
