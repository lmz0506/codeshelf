// 剪贴板历史管理器 - 自动记录复制内容、支持置顶/搜索、持久化存储

use crate::storage::config::get_storage_config;
use crate::storage::schema::{ClipboardEntry, ClipboardSettings};
use once_cell::sync::Lazy;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// 上次剪贴板内容哈希，用于检测变化
static LAST_CLIP_HASH: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));

// 文件操作互斥锁，防止监控线程和命令并发写文件
static FILE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

// ============== 工具函数 ==============

fn generate_preview(content: &str) -> String {
    let preview: String = content.chars().take(200).collect();
    preview.replace('\n', " ").replace('\r', "")
}

fn compute_hash(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}

fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", timestamp)
}

// ============== 文件读写 ==============

fn read_history_file() -> Result<Vec<ClipboardEntry>, String> {
    let _lock = FILE_LOCK.lock().unwrap();
    let config = get_storage_config()?;
    let path = config.clipboard_history_file();

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取剪贴板历史文件失败: {}", e))?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&content)
        .map_err(|e| format!("解析剪贴板历史文件失败: {}", e))
}

fn write_history_file(entries: &[ClipboardEntry]) -> Result<(), String> {
    let _lock = FILE_LOCK.lock().unwrap();
    let config = get_storage_config()?;
    let path = config.clipboard_history_file();

    let content = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("序列化剪贴板历史数据失败: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("写入剪贴板历史文件失败: {}", e))
}

fn read_settings_file() -> Result<ClipboardSettings, String> {
    let config = get_storage_config()?;
    let path = config.clipboard_settings_file();

    if !path.exists() {
        return Ok(ClipboardSettings::default());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取剪贴板设置文件失败: {}", e))?;

    if content.trim().is_empty() {
        return Ok(ClipboardSettings::default());
    }

    serde_json::from_str(&content)
        .map_err(|e| format!("解析剪贴板设置文件失败: {}", e))
}

fn write_settings_file(settings: &ClipboardSettings) -> Result<(), String> {
    let config = get_storage_config()?;
    let path = config.clipboard_settings_file();

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化剪贴板设置数据失败: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("写入剪贴板设置文件失败: {}", e))
}

// ============== 内部写入（不获取 FILE_LOCK，由调用者持有） ==============

fn write_history_file_unlocked(entries: &[ClipboardEntry]) -> Result<(), String> {
    let config = get_storage_config()?;
    let path = config.clipboard_history_file();

    let content = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("序列化剪贴板历史数据失败: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("写入剪贴板历史文件失败: {}", e))
}

fn read_history_file_unlocked() -> Result<Vec<ClipboardEntry>, String> {
    let config = get_storage_config()?;
    let path = config.clipboard_history_file();

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取剪贴板历史文件失败: {}", e))?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&content)
        .map_err(|e| format!("解析剪贴板历史文件失败: {}", e))
}

// ============== Tauri 命令 ==============

#[tauri::command]
pub async fn get_clipboard_history() -> Result<Vec<ClipboardEntry>, String> {
    let mut entries = read_history_file()?;
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

#[tauri::command]
pub async fn add_clipboard_entry(content: String) -> Result<ClipboardEntry, String> {
    let mut entries = read_history_file()?;

    let now = chrono::Utc::now().timestamp_millis();
    let entry = ClipboardEntry {
        id: generate_id(),
        content_preview: generate_preview(&content),
        char_count: content.chars().count(),
        content,
        timestamp: now,
        pinned: false,
        note: None,
    };

    entries.insert(0, entry.clone());

    // 按 max_items 裁剪
    let settings = read_settings_file()?;
    trim_entries(&mut entries, settings.max_items as usize);

    write_history_file(&entries)?;
    Ok(entry)
}

#[tauri::command]
pub async fn update_clipboard_note(id: String, note: String) -> Result<ClipboardEntry, String> {
    let mut entries = read_history_file()?;

    let entry = entries.iter_mut().find(|e| e.id == id)
        .ok_or_else(|| format!("剪贴板条目 {} 不存在", id))?;

    entry.note = if note.trim().is_empty() { None } else { Some(note) };
    let updated = entry.clone();

    write_history_file(&entries)?;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_clipboard_entry(id: String) -> Result<(), String> {
    let mut entries = read_history_file()?;
    entries.retain(|e| e.id != id);
    write_history_file(&entries)
}

#[tauri::command]
pub async fn toggle_pin_clipboard_entry(id: String) -> Result<ClipboardEntry, String> {
    let mut entries = read_history_file()?;

    let entry = entries.iter_mut().find(|e| e.id == id)
        .ok_or_else(|| format!("剪贴板条目 {} 不存在", id))?;

    entry.pinned = !entry.pinned;
    let updated = entry.clone();

    write_history_file(&entries)?;
    Ok(updated)
}

#[tauri::command]
pub async fn clear_clipboard_history() -> Result<(), String> {
    let mut entries = read_history_file()?;
    entries.retain(|e| e.pinned);
    write_history_file(&entries)
}

#[tauri::command]
pub async fn get_clipboard_settings() -> Result<ClipboardSettings, String> {
    read_settings_file()
}

#[tauri::command]
pub async fn save_clipboard_settings(settings: ClipboardSettings) -> Result<(), String> {
    write_settings_file(&settings)?;

    // 按新 max_items 裁剪队列
    let mut entries = read_history_file()?;
    trim_entries(&mut entries, settings.max_items as usize);
    write_history_file(&entries)
}

#[tauri::command]
pub async fn write_to_clipboard(content: String) -> Result<(), String> {
    // 更新哈希以防止监控重复记录
    let hash = compute_hash(&content);
    if let Ok(mut last_hash) = LAST_CLIP_HASH.lock() {
        *last_hash = hash;
    }

    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("无法访问系统剪贴板: {}", e))?;

    clipboard.set_text(&content)
        .map_err(|e| format!("写入系统剪贴板失败: {}", e))
}

// ============== 辅助函数 ==============

fn trim_entries(entries: &mut Vec<ClipboardEntry>, max_items: usize) {
    if entries.len() <= max_items {
        return;
    }
    // 保留所有 pinned + 最新的非 pinned
    let pinned_count = entries.iter().filter(|e| e.pinned).count();
    let max_unpinned = if max_items > pinned_count { max_items - pinned_count } else { 0 };

    // 按时间倒序排列
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    let mut unpinned_count = 0;
    entries.retain(|e| {
        if e.pinned {
            return true;
        }
        unpinned_count += 1;
        unpinned_count <= max_unpinned
    });
}

// ============== 后台监控 ==============

pub fn start_clipboard_monitor(app_handle: AppHandle) {
    // 使用 std::thread::spawn + 自建 sleep 循环，避免依赖 Tokio runtime
    // （Tauri setup 阶段 Tokio runtime 尚未就绪，tokio::spawn 会 panic）
    std::thread::spawn(move || {
        loop {
            // 读取设置
            let settings = match read_settings_file() {
                Ok(s) => s,
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    continue;
                }
            };

            if !settings.enabled {
                std::thread::sleep(std::time::Duration::from_millis(settings.monitor_interval_ms.max(500)));
                continue;
            }

            // 读取剪贴板
            let clip_text = {
                match arboard::Clipboard::new() {
                    Ok(mut cb) => cb.get_text().ok(),
                    Err(_) => None,
                }
            };

            if let Some(text) = clip_text {
                if !text.trim().is_empty() {
                    let hash = compute_hash(&text);

                    let is_new = {
                        let mut last_hash = LAST_CLIP_HASH.lock().unwrap();
                        if *last_hash == hash {
                            false
                        } else {
                            *last_hash = hash;
                            true
                        }
                    };

                    if is_new {
                        // 写入文件（获取 FILE_LOCK）
                        let result = {
                            let _lock = FILE_LOCK.lock().unwrap();
                            let mut entries = match read_history_file_unlocked() {
                                Ok(e) => e,
                                Err(_) => Vec::new(),
                            };

                            // 去重：如果内容已存在，移到最前面
                            entries.retain(|e| e.content != text);

                            let now = chrono::Utc::now().timestamp_millis();
                            let entry = ClipboardEntry {
                                id: generate_id(),
                                content_preview: generate_preview(&text),
                                char_count: text.chars().count(),
                                content: text,
                                timestamp: now,
                                pinned: false,
                                note: None,
                            };

                            entries.insert(0, entry);
                            trim_entries(&mut entries, settings.max_items as usize);
                            write_history_file_unlocked(&entries)
                        };

                        if result.is_ok() {
                            let _ = app_handle.emit("clipboard-changed", ());
                        }
                    }
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(settings.monitor_interval_ms));
        }
    });
}
