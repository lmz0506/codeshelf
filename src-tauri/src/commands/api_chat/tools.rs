// 把已有 Endpoint 包装成 OpenAI function-calling tools

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::storage::ApiEndpoint;

use super::load_endpoints;

#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ApiToolsBundle {
    /// OpenAI function tools 数组
    pub tools: Vec<Value>,
    /// tool_name -> endpoint_id
    pub tool_name_map: HashMap<String, String>,
}

/// 将 endpoint_id slugify 成 OpenAI function name（^[a-zA-Z0-9_-]{1,64}$）
fn sanitize_tool_name(endpoint_id: &str) -> String {
    let raw = format!("ep_{}", endpoint_id);
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.len() <= 60 {
        cleaned
    } else {
        cleaned.chars().take(60).collect()
    }
}

#[tauri::command]
#[specta::specta]
pub async fn build_api_tools(endpoint_ids: Vec<String>) -> Result<ApiToolsBundle, String> {
    let all = load_endpoints()?;
    let by_id: HashMap<String, ApiEndpoint> =
        all.into_iter().map(|e| (e.id.clone(), e)).collect();

    let mut tools: Vec<Value> = Vec::new();
    let mut map: HashMap<String, String> = HashMap::new();

    for eid in endpoint_ids {
        let Some(endpoint) = by_id.get(&eid) else {
            continue;
        };
        let tool_name = sanitize_tool_name(&endpoint.id);
        // 避免重名
        if map.contains_key(&tool_name) {
            continue;
        }
        let desc = endpoint
            .description
            .clone()
            .unwrap_or_else(|| format!("{} {}", endpoint.method, endpoint.url));
        let desc = format!(
            "{}\n(method: {}, url: {})",
            desc, endpoint.method, endpoint.url
        );
        // 参数 schema：允许为空对象
        let parameters = if endpoint.params_schema.is_null() {
            json!({ "type": "object", "properties": {} })
        } else {
            endpoint.params_schema.clone()
        };
        tools.push(json!({
            "type": "function",
            "function": {
                "name": tool_name,
                "description": desc,
                "parameters": parameters,
            }
        }));
        map.insert(tool_name, endpoint.id.clone());
    }

    Ok(ApiToolsBundle {
        tools,
        tool_name_map: map,
    })
}
