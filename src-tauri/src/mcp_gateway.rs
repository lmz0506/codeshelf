use axum::{
    extract::State,
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::{oneshot, Mutex};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tower_http::cors::CorsLayer;

use crate::commands::api_chat::{build_api_tools, execute_api_endpoint, list_api_endpoints};
use crate::storage;

const DEFAULT_PROTOCOL_VERSION: &str = "2024-11-05";

static APP_HTTP_GATEWAY: Lazy<Mutex<Option<AppHttpGateway>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Clone)]
pub enum Transport {
    Stdio,
    Http { host: String, port: u16 },
}

#[derive(Debug, Clone)]
pub struct GatewayConfig {
    pub transport: Transport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpGatewayStatus {
    pub running: bool,
    pub url: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub started_at: Option<String>,
    pub binary_path: Option<String>,
}

struct AppHttpGateway {
    host: String,
    port: u16,
    started_at: DateTime<Utc>,
    shutdown: Option<oneshot::Sender<()>>,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[serde(default)]
    jsonrpc: Option<String>,
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i64,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolsCallParams {
    name: String,
    #[serde(default)]
    arguments: Option<Value>,
}

pub async fn run_cli() -> Result<(), String> {
    let config = parse_args(std::env::args().skip(1).collect())?;
    run(config).await
}

pub async fn run(config: GatewayConfig) -> Result<(), String> {
    storage::init_storage()?;

    match config.transport {
        Transport::Stdio => run_stdio().await,
        Transport::Http { host, port } => run_http(host, port).await,
    }
}

fn parse_args(args: Vec<String>) -> Result<GatewayConfig, String> {
    let mut transport = "stdio".to_string();
    let mut host = "127.0.0.1".to_string();
    let mut port: u16 = 8787;
    let mut i = 0;

    while i < args.len() {
        match args[i].as_str() {
            "--transport" => {
                i += 1;
                transport = args
                    .get(i)
                    .ok_or_else(|| "--transport requires a value".to_string())?
                    .clone();
            }
            "--host" => {
                i += 1;
                host = args
                    .get(i)
                    .ok_or_else(|| "--host requires a value".to_string())?
                    .clone();
            }
            "--port" => {
                i += 1;
                let raw = args
                    .get(i)
                    .ok_or_else(|| "--port requires a value".to_string())?;
                port = raw
                    .parse::<u16>()
                    .map_err(|e| format!("invalid --port value: {}", e))?;
            }
            "--help" | "-h" => {
                return Err(help_text());
            }
            other => return Err(format!("unknown argument: {}\n{}", other, help_text())),
        }
        i += 1;
    }

    let transport = match transport.as_str() {
        "stdio" => Transport::Stdio,
        "http" => Transport::Http { host, port },
        other => return Err(format!("unsupported transport: {}", other)),
    };

    Ok(GatewayConfig { transport })
}

fn help_text() -> String {
    "Usage: codeshelf-mcp [--transport stdio|http] [--host 127.0.0.1] [--port 8787]"
        .to_string()
}

async fn run_stdio() -> Result<(), String> {
    let stdin = BufReader::new(io::stdin());
    let mut lines = stdin.lines();
    let mut stdout = io::stdout();

    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| format!("stdin read failed: {}", e))?
    {
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<JsonRpcRequest>(&line) {
            Ok(req) => handle_json_rpc(req).await,
            Err(e) => Some(error_response(
                Value::Null,
                -32700,
                "Parse error",
                Some(json!({ "message": e.to_string() })),
            )),
        };

        if let Some(resp) = response {
            let payload = serde_json::to_string(&resp)
                .map_err(|e| format!("response serialization failed: {}", e))?;
            stdout
                .write_all(payload.as_bytes())
                .await
                .map_err(|e| format!("stdout write failed: {}", e))?;
            stdout
                .write_all(b"\n")
                .await
                .map_err(|e| format!("stdout write failed: {}", e))?;
            stdout
                .flush()
                .await
                .map_err(|e| format!("stdout flush failed: {}", e))?;
        }
    }

    Ok(())
}

#[derive(Clone)]
struct HttpState;

async fn run_http(host: String, port: u16) -> Result<(), String> {
    let addr: SocketAddr = format!("{}:{}", host, port)
        .parse()
        .map_err(|e| format!("invalid HTTP bind address: {}", e))?;

    eprintln!("CodeShelf MCP gateway listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("HTTP bind failed: {}", e))?;
    axum::serve(listener, http_router())
        .await
        .map_err(|e| format!("HTTP server failed: {}", e))
}

fn http_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("*"))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any);

    Router::new()
        .route("/", get(http_index))
        .route("/health", get(http_health))
        .route("/mcp", get(http_index).post(http_mcp))
        .layer(cors)
        .with_state(Arc::new(HttpState))
}

#[tauri::command]
pub async fn mcp_gateway_status() -> Result<McpGatewayStatus, String> {
    let guard = APP_HTTP_GATEWAY.lock().await;
    Ok(status_from_gateway(guard.as_ref()))
}

#[tauri::command]
pub async fn mcp_gateway_start(host: Option<String>, port: Option<u16>) -> Result<McpGatewayStatus, String> {
    storage::init_storage()?;

    let host = host.unwrap_or_else(|| "127.0.0.1".to_string());
    let port = port.unwrap_or(8787);
    let addr: SocketAddr = format!("{}:{}", host, port)
        .parse()
        .map_err(|e| format!("invalid HTTP bind address: {}", e))?;

    let mut guard = APP_HTTP_GATEWAY.lock().await;
    if let Some(existing) = guard.as_ref() {
        if existing.host == host && existing.port == port && !existing.task.is_finished() {
            return Ok(status_from_gateway(guard.as_ref()));
        }

        if let Some(mut old) = guard.take() {
            if let Some(tx) = old.shutdown.take() {
                let _ = tx.send(());
            }
            old.task.abort();
        }
    }

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("HTTP bind failed: {}", e))?;
    let (tx, rx) = oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        let server = axum::serve(listener, http_router()).with_graceful_shutdown(async {
            let _ = rx.await;
        });
        if let Err(err) = server.await {
            eprintln!("CodeShelf MCP gateway stopped with error: {}", err);
        }
    });

    *guard = Some(AppHttpGateway {
        host,
        port,
        started_at: Utc::now(),
        shutdown: Some(tx),
        task,
    });

    Ok(status_from_gateway(guard.as_ref()))
}

#[tauri::command]
pub async fn mcp_gateway_stop() -> Result<McpGatewayStatus, String> {
    let mut guard = APP_HTTP_GATEWAY.lock().await;
    if let Some(mut gateway) = guard.take() {
        if let Some(tx) = gateway.shutdown.take() {
            let _ = tx.send(());
        }
        gateway.task.abort();
    }
    Ok(status_from_gateway(None))
}

fn status_from_gateway(gateway: Option<&AppHttpGateway>) -> McpGatewayStatus {
    if let Some(gateway) = gateway {
        if !gateway.task.is_finished() {
            return McpGatewayStatus {
                running: true,
                url: Some(format!("http://{}:{}/mcp", gateway.host, gateway.port)),
                host: Some(gateway.host.clone()),
                port: Some(gateway.port),
                started_at: Some(gateway.started_at.to_rfc3339()),
                binary_path: default_binary_path(),
            };
        }
    }

    McpGatewayStatus {
        running: false,
        url: None,
        host: None,
        port: None,
        started_at: None,
        binary_path: default_binary_path(),
    }
}

fn default_binary_path() -> Option<String> {
    let exe_name = if cfg!(target_os = "windows") {
        "codeshelf-mcp.exe"
    } else {
        "codeshelf-mcp"
    };
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join(exe_name)))
        .map(|path| path.to_string_lossy().to_string())
}

async fn http_index() -> impl IntoResponse {
    Json(json!({
        "name": "codeshelf-api-gateway",
        "ok": true,
        "mcp": {
            "endpoint": "/mcp",
            "transport": "http-json-rpc",
            "methods": ["initialize", "tools/list", "tools/call"]
        }
    }))
}

async fn http_health() -> impl IntoResponse {
    Json(json!({ "ok": true }))
}

async fn http_mcp(
    State(_state): State<Arc<HttpState>>,
    Json(req): Json<JsonRpcRequest>,
) -> impl IntoResponse {
    match handle_json_rpc(req).await {
        Some(resp) => (StatusCode::OK, Json(resp)).into_response(),
        None => (StatusCode::ACCEPTED, Json(json!({ "ok": true }))).into_response(),
    }
}

async fn handle_json_rpc(req: JsonRpcRequest) -> Option<JsonRpcResponse> {
    let id = req.id.clone().unwrap_or(Value::Null);
    let is_notification = req.id.is_none();

    if req.jsonrpc.as_deref().unwrap_or("2.0") != "2.0" {
        return Some(error_response(
            id,
            -32600,
            "Invalid Request",
            Some(json!({ "message": "jsonrpc must be 2.0" })),
        ));
    }

    let result = match req.method.as_str() {
        "initialize" => initialize_result(req.params.as_ref()),
        "notifications/initialized" => {
            if is_notification {
                return None;
            }
            Ok(json!({}))
        }
        "ping" => Ok(json!({})),
        "tools/list" => tools_list_result().await,
        "tools/call" => tools_call_result(req.params).await,
        method => Err(json_rpc_error(
            -32601,
            "Method not found",
            Some(json!({ "method": method })),
        )),
    };

    match result {
        Ok(value) => {
            if is_notification {
                None
            } else {
                Some(JsonRpcResponse {
                    jsonrpc: "2.0",
                    id,
                    result: Some(value),
                    error: None,
                })
            }
        }
        Err(err) => Some(JsonRpcResponse {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(err),
        }),
    }
}

fn initialize_result(params: Option<&Value>) -> Result<Value, JsonRpcError> {
    let protocol_version = params
        .and_then(|p| p.get("protocolVersion"))
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_PROTOCOL_VERSION);

    Ok(json!({
        "protocolVersion": protocol_version,
        "capabilities": {
            "tools": {
                "listChanged": true
            }
        },
        "serverInfo": {
            "name": "codeshelf-api-gateway",
            "version": env!("CARGO_PKG_VERSION")
        },
        "instructions": "Expose CodeShelf API library endpoints as MCP tools."
    }))
}

async fn tools_list_result() -> Result<Value, JsonRpcError> {
    let endpoints = list_api_endpoints()
        .await
        .map_err(internal_error)?;
    let endpoint_ids: Vec<String> = endpoints.iter().map(|e| e.id.clone()).collect();
    let bundle = build_api_tools(endpoint_ids)
        .await
        .map_err(internal_error)?;

    let by_id = endpoints
        .into_iter()
        .map(|endpoint| (endpoint.id.clone(), endpoint))
        .collect::<HashMap<_, _>>();

    let tools = bundle
        .tools
        .into_iter()
        .filter_map(|tool| {
            let function = tool.get("function")?;
            let name = function.get("name")?.as_str()?.to_string();
            let endpoint = bundle
                .tool_name_map
                .get(&name)
                .and_then(|endpoint_id| by_id.get(endpoint_id));
            let description = endpoint
                .and_then(|e| e.description.clone())
                .or_else(|| function.get("description").and_then(|v| v.as_str()).map(str::to_string))
                .unwrap_or_else(|| "CodeShelf API endpoint".to_string());
            let input_schema = function
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));
            let title = endpoint.map(|e| e.name.clone()).unwrap_or_else(|| name.clone());

            Some(json!({
                "name": name,
                "description": description,
                "inputSchema": input_schema,
                "annotations": {
                    "title": title
                }
            }))
        })
        .collect::<Vec<_>>();

    Ok(json!({ "tools": tools }))
}

async fn tools_call_result(params: Option<Value>) -> Result<Value, JsonRpcError> {
    let params_value = params.ok_or_else(|| {
        json_rpc_error(-32602, "Invalid params", Some(json!({ "message": "missing params" })))
    })?;
    let params: ToolsCallParams = serde_json::from_value(params_value)
        .map_err(|e| json_rpc_error(-32602, "Invalid params", Some(json!({ "message": e.to_string() }))))?;

    let endpoints = list_api_endpoints()
        .await
        .map_err(internal_error)?;
    let endpoint_ids: Vec<String> = endpoints.into_iter().map(|e| e.id).collect();
    let bundle = build_api_tools(endpoint_ids)
        .await
        .map_err(internal_error)?;
    let endpoint_id = bundle.tool_name_map.get(&params.name).ok_or_else(|| {
        json_rpc_error(
            -32602,
            "Unknown tool",
            Some(json!({ "name": params.name })),
        )
    })?;
    let arguments = params.arguments.unwrap_or_else(|| json!({}));
    let arguments_json = serde_json::to_string(&arguments).map_err(internal_error)?;

    let result = execute_api_endpoint(endpoint_id.clone(), arguments_json)
        .await
        .map_err(|e| {
            json_rpc_error(
                -32000,
                "Tool execution failed",
                Some(json!({ "message": e })),
            )
        })?;
    let text = serde_json::to_string_pretty(&result).map_err(internal_error)?;

    Ok(json!({
        "content": [
            {
                "type": "text",
                "text": text
            }
        ],
        "structuredContent": result,
        "isError": false
    }))
}

fn error_response(id: Value, code: i64, message: &str, data: Option<Value>) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(json_rpc_error(code, message, data)),
    }
}

fn json_rpc_error(code: i64, message: &str, data: Option<Value>) -> JsonRpcError {
    JsonRpcError {
        code,
        message: message.to_string(),
        data,
    }
}

fn internal_error<E: ToString>(error: E) -> JsonRpcError {
    json_rpc_error(
        -32603,
        "Internal error",
        Some(json!({ "message": error.to_string() })),
    )
}
