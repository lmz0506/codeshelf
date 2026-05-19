// SSH 隧道运行时：监听本地端口、转发到远端、统计

use crate::error::AppResult;
use std::sync::Arc;

use russh::client;
use socket2::{Domain, Socket, Type};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, Semaphore};
use tokio::time::{timeout, Duration};

use super::{SshClient, SshTunnelController, SSH_CONTROLLERS, SSH_TUNNELS};

/// 监听本地端口，每个入站连接通过 SSH 开 direct-tcpip
pub(super) async fn run_tunnel_server(
    tunnel_id: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
    ssh_handle: Arc<Mutex<client::Handle<SshClient>>>,
    controller: Arc<SshTunnelController>,
) -> AppResult<()> {
    let addr: std::net::SocketAddr = format!("0.0.0.0:{}", local_port)
        .parse()
        .map_err(|e| crate::error::AppError::from(format!("解析地址失败: {}", e)))?;

    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)
        .map_err(|e| crate::error::AppError::from(format!("创建 socket 失败: {}", e)))?;
    socket
        .set_reuse_address(true)
        .map_err(|e| crate::error::AppError::from(format!("设置 SO_REUSEADDR 失败: {}", e)))?;
    socket
        .set_linger(Some(std::time::Duration::from_secs(0)))
        .map_err(|e| crate::error::AppError::from(format!("设置 SO_LINGER 失败: {}", e)))?;
    socket
        .set_nonblocking(true)
        .map_err(|e| crate::error::AppError::from(format!("设置非阻塞失败: {}", e)))?;
    socket
        .bind(&addr.into())
        .map_err(|e| crate::error::AppError::from(format!("绑定端口失败: {}", e)))?;
    socket
        .listen(128)
        .map_err(|e| crate::error::AppError::from(format!("监听端口失败: {}", e)))?;

    let std_listener: std::net::TcpListener = socket.into();
    let listener = TcpListener::from_std(std_listener)
        .map_err(|e| crate::error::AppError::from(format!("创建 TcpListener 失败: {}", e)))?;

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

                    if let Err(e) = handle_tunnel_connection(
                        inbound,
                        peer_addr,
                        handle,
                        &rhost,
                        rport,
                        ctrl.clone(),
                    )
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
) -> AppResult<()> {
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
            .map_err(|e| crate::error::AppError::from(format!("打开 direct-tcpip 失败: {}", e)))?
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
            match timeout(
                check_interval,
                tokio::io::AsyncReadExt::read(&mut ri, &mut buf),
            )
            .await
            {
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
            match timeout(
                check_interval,
                tokio::io::AsyncReadExt::read(&mut ro, &mut buf),
            )
            .await
            {
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

pub(super) async fn update_tunnel_stats(tunnel_id: &str) {
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
