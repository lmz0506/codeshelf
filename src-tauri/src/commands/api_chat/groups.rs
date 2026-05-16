// Group CRUD

use crate::storage::{current_iso_time, generate_id, ApiGroup};

use super::execute::drop_session_client;
use super::{load_endpoints, load_groups, write_endpoints, write_groups};

#[tauri::command]
pub async fn list_api_groups() -> Result<Vec<ApiGroup>, String> {
    let mut groups = load_groups()?;
    groups.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(groups)
}

#[tauri::command]
pub async fn save_api_group(mut group: ApiGroup) -> Result<ApiGroup, String> {
    let mut groups = load_groups()?;
    let now = current_iso_time();
    if group.id.trim().is_empty() {
        group.id = generate_id();
        group.created_at = now.clone();
    }
    group.updated_at = now;

    if let Some(idx) = groups.iter().position(|g| g.id == group.id) {
        if group.created_at.trim().is_empty() {
            group.created_at = groups[idx].created_at.clone();
        }
        groups[idx] = group.clone();
    } else {
        if group.created_at.trim().is_empty() {
            group.created_at = group.updated_at.clone();
        }
        groups.push(group.clone());
    }
    write_groups(&groups)?;
    // Session 鉴权变更时，清掉对应 client 强制重登
    drop_session_client(&group.id).await;
    Ok(group)
}

#[tauri::command]
pub async fn delete_api_group(id: String) -> Result<(), String> {
    let mut groups = load_groups()?;
    groups.retain(|g| g.id != id);
    write_groups(&groups)?;

    // 级联：把组下接口的 group_id 置空（保留接口）
    let mut endpoints = load_endpoints()?;
    let mut dirty = false;
    for ep in endpoints.iter_mut() {
        if ep.group_id.as_deref() == Some(&id) {
            ep.group_id = None;
            ep.updated_at = current_iso_time();
            dirty = true;
        }
    }
    if dirty {
        write_endpoints(&endpoints)?;
    }
    drop_session_client(&id).await;
    Ok(())
}
