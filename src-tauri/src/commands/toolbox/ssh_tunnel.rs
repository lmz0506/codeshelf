// SSH 隧道模块 - 等价 `ssh -N -L localPort:remoteHost:remotePort user@sshHost`
// 底层使用 russh 纯 Rust 客户端实现，支持私钥/密码/读取 ~/.ssh/config 三种认证方式

use super::{current_time, generate_id, SshAuthMethod, SshTunnel, SshTunnelInput, SshTunnelStats, TestPortResult};
use crate::storage;
use once_cell::sync::Lazy;
use russh::client;
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use socket2::{Domain, Socket, Type};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio::sync::{Mutex, Semaphore};
use tokio::time::{timeout, Duration};

/// 隧道存储
static SSH_TUNNELS: Lazy<Arc<Mutex<HashMap<String, SshTunnel>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 是否已加载
static TUNNELS_LOADED: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

/// 控制器（用于停止）
static SSH_CONTROLLERS: Lazy<Arc<Mutex<HashMap<String, Arc<SshTunnelController>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 隧道控制器
struct SshTunnelController {
    stop: AtomicBool,
    connections: AtomicU32,
    bytes_in: AtomicU64,
    bytes_out: AtomicU64,
}

impl SshTunnelController {
    fn new() -> Self {
        Self {
            stop: AtomicBool::new(false),
            connections: AtomicU32::new(0),
            bytes_in: AtomicU64::new(0),
            bytes_out: AtomicU64::new(0),
        }
    }

    fn is_stopped(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }

    fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    fn inc_connections(&self) {
        self.connections.fetch_add(1, Ordering::SeqCst);
    }

    fn dec_connections(&self) {
        self.connections.fetch_sub(1, Ordering::SeqCst);
    }

    fn add_bytes_in(&self, n: u64) {
        self.bytes_in.fetch_add(n, Ordering::SeqCst);
    }

    fn add_bytes_out(&self, n: u64) {
        self.bytes_out.fetch_add(n, Ordering::SeqCst);
    }

    fn get_stats(&self) -> (u32, u64, u64) {
        (
            self.connections.load(Ordering::SeqCst),
            self.bytes_in.load(Ordering::SeqCst),
            self.bytes_out.load(Ordering::SeqCst),
        )
    }
}

/// russh 客户端 handler - 接受任意 host key（首版不校验 known_hosts）
struct SshClient;

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

async fn ensure_tunnels_loaded() {
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

async fn save_tunnels_to_file() -> Result<(), String> {
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

// ============== 认证 ==============

/// 解析 ~/.ssh/config 中某个 Host 别名，返回 (user, host, port, identity_files)
fn resolve_ssh_config(alias: &str) -> Result<(String, String, u16, Vec<PathBuf>), String> {
    let cfg = russh_config::parse_home(alias)
        .map_err(|e| format!("解析 ~/.ssh/config 失败: {}", e))?;
    let user = cfg.user();
    let host = cfg.host().to_string();
    let port = cfg.port();
    let identity_files = cfg.host_config.identity_file.unwrap_or_default();
    Ok((user, host, port, identity_files))
}

/// 列出 ~/.ssh/config 中的 Host 别名（用于前端下拉）
fn list_host_aliases_from_config() -> Vec<String> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };
    let path = home.join(".ssh").join("config");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut aliases: Vec<String> = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut parts = trimmed.splitn(2, char::is_whitespace);
        let key = parts.next().unwrap_or("").to_lowercase();
        if key != "host" {
            continue;
        }
        let value = parts.next().unwrap_or("").trim();
        for pattern in value.split_whitespace() {
            // 跳过通配符 (eg "*", "*.example.com")
            if pattern.contains('*') || pattern.contains('?') || pattern.starts_with('!') {
                continue;
            }
            if !aliases.iter().any(|a| a == pattern) {
                aliases.push(pattern.to_string());
            }
        }
    }
    aliases
}

/// 连接 SSH 并完成认证，返回 client handle
async fn connect_and_authenticate(tunnel: &SshTunnel) -> Result<client::Handle<SshClient>, String> {
    let config = Arc::new(client::Config {
        // None = 不做 inactivity 检测；保活由 keepalive_interval 负责。
        // 之前误用 Some(Duration::from_secs(0)) 反而会"0 秒后超时"，立刻断开。
        inactivity_timeout: None,
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        ..<_>::default()
    });

    let (effective_user, effective_host, effective_port, identity_files) = match &tunnel.auth {
        SshAuthMethod::SshConfig { host_alias } => resolve_ssh_config(host_alias)?,
        _ => (
            tunnel.ssh_user.clone(),
            tunnel.ssh_host.clone(),
            tunnel.ssh_port,
            vec![],
        ),
    };

    if effective_user.is_empty() {
        return Err("SSH 用户名不能为空".to_string());
    }
    if effective_host.is_empty() {
        return Err("SSH 主机不能为空".to_string());
    }

    log::info!(
        "SSH 连接 {}@{}:{}",
        effective_user,
        effective_host,
        effective_port
    );

    let mut session =
        client::connect(config, (effective_host.as_str(), effective_port), SshClient)
            .await
            .map_err(|e| format!("SSH 连接失败: {}", e))?;

    let success = match &tunnel.auth {
        SshAuthMethod::Password { password } => session
            .authenticate_password(&effective_user, password)
            .await
            .map_err(|e| format!("SSH 密码认证失败: {}", e))?
            .success(),

        SshAuthMethod::Key { key_path, passphrase } => {
            let pp = passphrase.as_deref().filter(|s| !s.is_empty());
            let key = load_secret_key(key_path, pp)
                .map_err(|e| format!("加载私钥失败 ({}): {}", key_path, e))?;
            let hash = session
                .best_supported_rsa_hash()
                .await
                .map_err(|e| format!("协商 RSA hash 失败: {}", e))?
                .flatten();
            session
                .authenticate_publickey(
                    &effective_user,
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                )
                .await
                .map_err(|e| format!("SSH 私钥认证失败: {}", e))?
                .success()
        }

        SshAuthMethod::SshConfig { host_alias } => {
            if identity_files.is_empty() {
                return Err(format!(
                    "~/.ssh/config 中 Host '{}' 未配置 IdentityFile",
                    host_alias
                ));
            }
            let mut last_err: Option<String> = None;
            let mut authed = false;
            for path in &identity_files {
                let path_str = path.to_string_lossy().to_string();
                let key = match load_secret_key(path, None) {
                    Ok(k) => k,
                    Err(e) => {
                        last_err = Some(format!("加载私钥 {} 失败: {}", path_str, e));
                        continue;
                    }
                };
                let hash = session
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| format!("协商 RSA hash 失败: {}", e))?
                    .flatten();
                let res = session
                    .authenticate_publickey(
                        &effective_user,
                        PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                    )
                    .await
                    .map_err(|e| format!("SSH 私钥认证失败 ({}): {}", path_str, e))?;
                if res.success() {
                    authed = true;
                    break;
                } else {
                    last_err = Some(format!("私钥 {} 认证被拒绝", path_str));
                }
            }
            if !authed {
                return Err(last_err.unwrap_or_else(|| "所有 IdentityFile 认证均失败".to_string()));
            }
            true
        }
    };

    if !success {
        return Err("SSH 认证被拒绝".to_string());
    }

    Ok(session)
}

// ============== 服务循环 ==============

/// 监听本地端口，每个入站连接通过 SSH 开 direct-tcpip
async fn run_tunnel_server(
    tunnel_id: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
    ssh_handle: Arc<Mutex<client::Handle<SshClient>>>,
    controller: Arc<SshTunnelController>,
) -> Result<(), String> {
    let addr: std::net::SocketAddr = format!("0.0.0.0:{}", local_port)
        .parse()
        .map_err(|e| format!("解析地址失败: {}", e))?;

    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)
        .map_err(|e| format!("创建 socket 失败: {}", e))?;
    socket
        .set_reuse_address(true)
        .map_err(|e| format!("设置 SO_REUSEADDR 失败: {}", e))?;
    socket
        .set_linger(Some(std::time::Duration::from_secs(0)))
        .map_err(|e| format!("设置 SO_LINGER 失败: {}", e))?;
    socket
        .set_nonblocking(true)
        .map_err(|e| format!("设置非阻塞失败: {}", e))?;
    socket
        .bind(&addr.into())
        .map_err(|e| format!("绑定端口失败: {}", e))?;
    socket
        .listen(128)
        .map_err(|e| format!("监听端口失败: {}", e))?;

    let std_listener: std::net::TcpListener = socket.into();
    let listener = TcpListener::from_std(std_listener)
        .map_err(|e| format!("创建 TcpListener 失败: {}", e))?;

    log::info!(
        "SSH 隧道服务启动: localhost:{} -> ssh -> {}:{}",
        local_port,
        remote_host,
        remote_port
    );

    let semaphore = Arc::new(Semaphore::new(64));

    loop {
        if controller.is_stopped() {
            log::info!("SSH 隧道停止: {}", local_port);
            break;
        }

        let accept_result = timeout(Duration::from_secs(1), listener.accept()).await;
        match accept_result {
            Ok(Ok((inbound, peer_addr))) => {
                let permit = semaphore.clone().acquire_owned().await;
                if permit.is_err() {
                    continue;
                }

                let handle = ssh_handle.clone();
                let ctrl = controller.clone();
                let id = tunnel_id.clone();
                let rhost = remote_host.clone();
                let rport = remote_port;

                tokio::spawn(async move {
                    let _permit = permit;
                    ctrl.inc_connections();
                    update_tunnel_stats(&id).await;

                    if let Err(e) =
                        handle_tunnel_connection(inbound, peer_addr, handle, &rhost, rport, ctrl.clone())
                            .await
                    {
                        log::debug!("SSH 隧道连接错误 {}: {}", peer_addr, e);
                    }

                    ctrl.dec_connections();
                    update_tunnel_stats(&id).await;
                });
            }
            Ok(Err(e)) => {
                log::error!("accept 失败: {}", e);
            }
            Err(_) => continue,
        }
    }

    Ok(())
}

/// 处理一个入站连接：开 direct-tcpip，双向拷贝
async fn handle_tunnel_connection(
    mut inbound: tokio::net::TcpStream,
    peer_addr: std::net::SocketAddr,
    ssh_handle: Arc<Mutex<client::Handle<SshClient>>>,
    remote_host: &str,
    remote_port: u16,
    controller: Arc<SshTunnelController>,
) -> Result<(), String> {
    let channel = {
        let handle = ssh_handle.lock().await;
        handle
            .channel_open_direct_tcpip(
                remote_host,
                remote_port as u32,
                peer_addr.ip().to_string(),
                peer_addr.port() as u32,
            )
            .await
            .map_err(|e| format!("打开 direct-tcpip 失败: {}", e))?
    };

    let mut stream = channel.into_stream();
    let (mut ri, mut wi) = inbound.split();
    let (mut ro, mut wo) = tokio::io::split(&mut stream);

    let ctrl1 = controller.clone();
    let ctrl2 = controller.clone();
    let check_interval = Duration::from_millis(100);

    let client_to_server = async {
        let mut buf = [0u8; 8192];
        loop {
            if ctrl1.is_stopped() {
                break;
            }
            match timeout(check_interval, tokio::io::AsyncReadExt::read(&mut ri, &mut buf)).await {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => {
                    ctrl1.add_bytes_out(n as u64);
                    if tokio::io::AsyncWriteExt::write_all(&mut wo, &buf[..n])
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(Err(_)) => break,
                Err(_) => continue,
            }
        }
        let _ = wo.shutdown().await;
    };

    let server_to_client = async {
        let mut buf = [0u8; 8192];
        loop {
            if ctrl2.is_stopped() {
                break;
            }
            match timeout(check_interval, tokio::io::AsyncReadExt::read(&mut ro, &mut buf)).await {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => {
                    ctrl2.add_bytes_in(n as u64);
                    if tokio::io::AsyncWriteExt::write_all(&mut wi, &buf[..n])
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(Err(_)) => break,
                Err(_) => continue,
            }
        }
        let _ = wi.shutdown().await;
    };

    tokio::join!(client_to_server, server_to_client);
    Ok(())
}

async fn update_tunnel_stats(tunnel_id: &str) {
    let stats = {
        let controllers = SSH_CONTROLLERS.lock().await;
        controllers.get(tunnel_id).map(|c| c.get_stats())
    };

    if let Some((connections, bytes_in, bytes_out)) = stats {
        let mut tunnels = SSH_TUNNELS.lock().await;
        if let Some(t) = tunnels.get_mut(tunnel_id) {
            t.connections = connections;
            t.bytes_in = bytes_in;
            t.bytes_out = bytes_out;
        }
    }
}

// ============== Tauri Commands ==============

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

// ============== 端口连通性测试 ==============
//
// 验证本地端口（隧道映射端口）是否真的能连通：
//   - macOS / Linux: `nc -z -w 2 127.0.0.1 <port>` （-v 走 stderr，便于复刻 issue 里的输出）
//   - Windows: PowerShell `Test-NetConnection -ComputerName ... -Port ...`
//   - 命令缺失时回退到原生 TCP connect，行为一致

const TEST_HOST: &str = "127.0.0.1";
const TEST_TIMEOUT_SECS: u64 = 3;

#[tauri::command]
pub async fn test_ssh_tunnel(tunnel_id: String) -> Result<TestPortResult, String> {
    ensure_tunnels_loaded().await;
    let port = {
        let tunnels = SSH_TUNNELS.lock().await;
        tunnels.get(&tunnel_id).map(|t| t.local_port)
    };
    let port = port.ok_or_else(|| format!("隧道不存在: {}", tunnel_id))?;
    Ok(test_local_port_inner(port).await)
}

#[tauri::command]
pub async fn test_local_port(port: u16) -> Result<TestPortResult, String> {
    Ok(test_local_port_inner(port).await)
}

async fn test_local_port_inner(port: u16) -> TestPortResult {
    let start = std::time::Instant::now();

    #[cfg(target_os = "windows")]
    let native = test_via_test_net_connection(TEST_HOST, port).await;

    #[cfg(not(target_os = "windows"))]
    let native = test_via_nc(TEST_HOST, port).await;

    let mut result = match native {
        Some(r) => r,
        None => test_via_tcp(TEST_HOST, port).await,
    };
    result.duration_ms = start.elapsed().as_millis() as u64;
    result
}

/// 兜底：纯 Rust TCP 连接，所有平台一致
async fn test_via_tcp(host: &str, port: u16) -> TestPortResult {
    let addr = format!("{}:{}", host, port);
    match timeout(
        Duration::from_secs(TEST_TIMEOUT_SECS),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    {
        Ok(Ok(_)) => TestPortResult {
            success: true,
            output: format!("Connection to {} port {} [tcp/*] succeeded!", host, port),
            method: "tcp".to_string(),
            duration_ms: 0,
        },
        Ok(Err(e)) => TestPortResult {
            success: false,
            output: format!("Connection to {} port {} failed: {}", host, port, e),
            method: "tcp".to_string(),
            duration_ms: 0,
        },
        Err(_) => TestPortResult {
            success: false,
            output: format!(
                "Connection to {} port {} timed out after {}s",
                host, port, TEST_TIMEOUT_SECS
            ),
            method: "tcp".to_string(),
            duration_ms: 0,
        },
    }
}

/// macOS / Linux: 用 nc -z -v -w
#[cfg(not(target_os = "windows"))]
async fn test_via_nc(host: &str, port: u16) -> Option<TestPortResult> {
    // 同步检测命令是否存在，避免 nc 不存在时的 spawn error 体验
    if which_unix("nc").is_none() {
        return None;
    }
    let output = match timeout(
        Duration::from_secs(TEST_TIMEOUT_SECS + 2),
        Command::new("nc")
            .args([
                "-z",
                "-v",
                "-w",
                &TEST_TIMEOUT_SECS.to_string(),
                host,
                &port.to_string(),
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    {
        Ok(Ok(o)) => o,
        Ok(Err(_)) => return None,
        Err(_) => {
            return Some(TestPortResult {
                success: false,
                output: format!("nc 超时（{}s）", TEST_TIMEOUT_SECS + 2),
                method: "nc".to_string(),
                duration_ms: 0,
            })
        }
    };

    // nc 把详细输出写到 stderr，stdout 通常为空
    let mut text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if text.is_empty() {
        text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    }
    Some(TestPortResult {
        success: output.status.success(),
        output: if text.is_empty() {
            if output.status.success() {
                format!("nc -z {} {} → 成功", host, port)
            } else {
                format!("nc -z {} {} → 失败", host, port)
            }
        } else {
            text
        },
        method: "nc".to_string(),
        duration_ms: 0,
    })
}

/// Windows: PowerShell Test-NetConnection
#[cfg(target_os = "windows")]
async fn test_via_test_net_connection(host: &str, port: u16) -> Option<TestPortResult> {
    // 优先 pwsh（Win 11+ / PowerShell 7），回退 powershell
    let shell = if which_windows("pwsh.exe").is_some() {
        "pwsh.exe"
    } else if which_windows("powershell.exe").is_some() {
        "powershell.exe"
    } else {
        return None;
    };

    let script = format!(
        "$ProgressPreference='SilentlyContinue'; \
         $r = Test-NetConnection -ComputerName '{}' -Port {} -InformationLevel Quiet -WarningAction SilentlyContinue; \
         if ($r) {{ Write-Output 'TcpTestSucceeded'; exit 0 }} else {{ Write-Output 'TcpTestFailed'; exit 1 }}",
        host, port
    );

    let output = match timeout(
        Duration::from_secs(TEST_TIMEOUT_SECS + 5),
        Command::new(shell)
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    {
        Ok(Ok(o)) => o,
        Ok(Err(_)) => return None,
        Err(_) => {
            return Some(TestPortResult {
                success: false,
                output: format!("Test-NetConnection 超时（{}s）", TEST_TIMEOUT_SECS + 5),
                method: "Test-NetConnection".to_string(),
                duration_ms: 0,
            })
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let success = output.status.success();
    let summary = if success {
        format!("Test-NetConnection -ComputerName {} -Port {} → succeeded", host, port)
    } else {
        format!("Test-NetConnection -ComputerName {} -Port {} → failed", host, port)
    };
    let combined = match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => summary,
        (false, true) => format!("{}\n{}", summary, stdout),
        (true, false) => format!("{}\n{}", summary, stderr),
        (false, false) => format!("{}\n{}\n{}", summary, stdout, stderr),
    };
    Some(TestPortResult {
        success,
        output: combined,
        method: "Test-NetConnection".to_string(),
        duration_ms: 0,
    })
}

/// 极简的 PATH 查找（Unix）：扫 PATH 里第一个可执行的同名文件
#[cfg(not(target_os = "windows"))]
fn which_unix(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if let Ok(meta) = std::fs::metadata(&candidate) {
            if meta.is_file() {
                use std::os::unix::fs::PermissionsExt;
                if meta.permissions().mode() & 0o111 != 0 {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

/// PATH 查找（Windows）
#[cfg(target_os = "windows")]
fn which_windows(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
