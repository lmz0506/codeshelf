// Endpoint CRUD

use crate::storage::{current_iso_time, generate_id, ApiEndpoint};

use super::{load_endpoints, write_endpoints};

#[tauri::command]
#[specta::specta]
pub async fn list_api_endpoints() -> Result<Vec<ApiEndpoint>, String> {
    let mut endpoints = load_endpoints()?;
    endpoints.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(endpoints)
}

#[tauri::command]
#[specta::specta]
pub async fn save_api_endpoint(mut endpoint: ApiEndpoint) -> Result<ApiEndpoint, String> {
    let mut endpoints = load_endpoints()?;
    let now = current_iso_time();
    if endpoint.id.trim().is_empty() {
        endpoint.id = generate_id();
        endpoint.created_at = now.clone();
    }
    endpoint.updated_at = now;

    if let Some(idx) = endpoints.iter().position(|e| e.id == endpoint.id) {
        if endpoint.created_at.trim().is_empty() {
            endpoint.created_at = endpoints[idx].created_at.clone();
        }
        endpoints[idx] = endpoint.clone();
    } else {
        if endpoint.created_at.trim().is_empty() {
            endpoint.created_at = endpoint.updated_at.clone();
        }
        endpoints.push(endpoint.clone());
    }
    write_endpoints(&endpoints)?;
    Ok(endpoint)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_api_endpoint(id: String) -> Result<(), String> {
    let mut endpoints = load_endpoints()?;
    endpoints.retain(|e| e.id != id);
    write_endpoints(&endpoints)
}
