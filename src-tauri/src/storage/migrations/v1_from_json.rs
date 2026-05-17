// v1 迁移：把 4 个高频数据集从 JSON 文件搬到 SQLite。
//
// 设计：
// - 每个数据集一个 pub async fn，独立事务
// - 文件不存在时静默跳过（干净安装 / 用户从未用过这个功能）
// - 解析失败立即返回错误（用户可通过 backup_<ts>/ 恢复）
// - INSERT 使用 ON CONFLICT DO NOTHING：万一同名 id 已存在不会破坏
// - 最后 mark_files_migrated() 给原文件改名加 .migrated，保留作最后保险

use std::fs;
use std::path::Path;

use sqlx::Acquire;

use crate::storage::db::pool;
use crate::storage::{
    ChatMessage, ChatSession, ClipboardEntry, CompactionIndex, Project,
};

// ============ Projects ============

pub async fn migrate_projects(data_dir: &Path) -> Result<(), String> {
    let path = data_dir.join("projects.json");
    if !path.exists() {
        log::debug!("projects.json 不存在，跳过");
        return Ok(());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("读取 projects.json 失败: {}", e))?;
    let projects: Vec<Project> = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 projects.json 失败: {}", e))?;

    let pool = pool();
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("获取连接失败: {}", e))?;
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("开启事务失败: {}", e))?;

    for p in &projects {
        sqlx::query(
            "INSERT INTO projects (
                id, name, path, is_favorite, created_at, updated_at,
                last_opened, editor_id, claude_env_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING",
        )
        .bind(&p.id)
        .bind(&p.name)
        .bind(&p.path)
        .bind(p.is_favorite as i64)
        .bind(&p.created_at)
        .bind(&p.updated_at)
        .bind(&p.last_opened)
        .bind(&p.editor_id)
        .bind(&p.claude_env_name)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("插入 project {} 失败: {}", p.id, e))?;

        for tag in &p.tags {
            sqlx::query(
                "INSERT INTO project_tags (project_id, tag) VALUES (?, ?)
                 ON CONFLICT DO NOTHING",
            )
            .bind(&p.id)
            .bind(tag)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("插入 project_tag 失败: {}", e))?;
        }
        for label in &p.labels {
            sqlx::query(
                "INSERT INTO project_labels (project_id, label) VALUES (?, ?)
                 ON CONFLICT DO NOTHING",
            )
            .bind(&p.id)
            .bind(label)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("插入 project_label 失败: {}", e))?;
        }
    }

    tx.commit()
        .await
        .map_err(|e| format!("提交 projects 事务失败: {}", e))?;
    log::info!("迁移 projects: {} 条", projects.len());
    Ok(())
}

// ============ Chat ============

pub async fn migrate_chat(data_dir: &Path) -> Result<(), String> {
    let conv_dir = data_dir.join("conversations");
    if !conv_dir.exists() {
        log::debug!("conversations/ 不存在，跳过");
        return Ok(());
    }

    let mut session_count: usize = 0;
    let mut message_count: usize = 0;
    let mut compaction_count: usize = 0;

    let entries = fs::read_dir(&conv_dir)
        .map_err(|e| format!("读取 conversations 失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let path = entry.path();
        let ft = entry.file_type().map_err(|e| format!("读取类型失败: {}", e))?;

        // 顶层 *.json 文件 = 一个 session
        if ft.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let session_id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .ok_or_else(|| format!("无法解析文件名: {:?}", path))?
                .to_string();

            let (s_added, m_added) = migrate_one_session(&path, &session_id).await?;
            session_count += s_added;
            message_count += m_added;

            // 该 session 可能有 compactions 子目录
            let comp_dir = conv_dir.join(&session_id).join("compactions");
            if comp_dir.exists() {
                compaction_count += migrate_session_compactions(&session_id, &comp_dir).await?;
            }
        }
    }

    log::info!(
        "迁移 chat: {} 个会话 / {} 条消息 / {} 个压缩",
        session_count,
        message_count,
        compaction_count
    );
    Ok(())
}

async fn migrate_one_session(path: &Path, session_id: &str) -> Result<(usize, usize), String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("读取 {:?} 失败: {}", path, e))?;
    let session: ChatSession = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 {:?} 失败: {}", path, e))?;

    let pool = pool();
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("获取连接失败: {}", e))?;
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("开启事务失败: {}", e))?;

    sqlx::query(
        "INSERT INTO chat_sessions (
            id, title, provider_id, model_id, created_at, updated_at,
            system_prompt, temperature, max_tokens, top_p, frequency_penalty,
            presence_penalty, pinned, allowed_cwd, use_mcp_gateway_tools,
            current_compaction_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING",
    )
    .bind(&session.id)
    .bind(&session.title)
    .bind(&session.provider_id)
    .bind(&session.model_id)
    .bind(&session.created_at)
    .bind(&session.updated_at)
    .bind(&session.system_prompt)
    .bind(session.temperature.map(|x| x as f64))
    .bind(session.max_tokens.map(|x| x as i64))
    .bind(session.top_p.map(|x| x as f64))
    .bind(session.frequency_penalty.map(|x| x as f64))
    .bind(session.presence_penalty.map(|x| x as f64))
    .bind(session.pinned.map(|x| x as i64))
    .bind(&session.allowed_cwd)
    .bind(session.use_mcp_gateway_tools.map(|x| x as i64))
    .bind(&session.current_compaction_version)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("插入 session {} 失败: {}", session.id, e))?;

    let msg_count = session.messages.len();
    for (idx, m) in session.messages.iter().enumerate() {
        insert_message(&mut *tx, &session.id, idx, m).await?;
    }

    if let Some(allowed) = &session.allowed_tools {
        for tn in allowed {
            sqlx::query(
                "INSERT INTO chat_session_tools (session_id, tool_name, is_allowed, is_enabled)
                 VALUES (?, ?, 1, 0)
                 ON CONFLICT(session_id, tool_name) DO UPDATE SET is_allowed = 1",
            )
            .bind(&session.id)
            .bind(tn)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("插入 allowed_tool 失败: {}", e))?;
        }
    }
    if let Some(enabled) = &session.enabled_tools {
        for tn in enabled {
            sqlx::query(
                "INSERT INTO chat_session_tools (session_id, tool_name, is_allowed, is_enabled)
                 VALUES (?, ?, 0, 1)
                 ON CONFLICT(session_id, tool_name) DO UPDATE SET is_enabled = 1",
            )
            .bind(&session.id)
            .bind(tn)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("插入 enabled_tool 失败: {}", e))?;
        }
    }

    tx.commit()
        .await
        .map_err(|e| format!("提交 session {} 事务失败: {}", session_id, e))?;

    Ok((1, msg_count))
}

async fn insert_message<'e, E>(
    executor: E,
    session_id: &str,
    sort_order: usize,
    m: &ChatMessage,
) -> Result<(), String>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let tool_calls_json = m.tool_calls.as_ref().map(|v| v.to_string());
    let attachments_json = m.attachments.as_ref().map(|v| v.to_string());

    sqlx::query(
        "INSERT INTO chat_messages (
            id, session_id, role, content, created_at, tokens, thinking,
            thinking_content, edited, tool_calls_json, tool_call_id,
            tool_name, tool_status, tool_method, tool_url, tool_elapsed_ms,
            tool_body_bytes, tool_truncated, attachments_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING",
    )
    .bind(&m.id)
    .bind(session_id)
    .bind(&m.role)
    .bind(&m.content)
    .bind(&m.created_at)
    .bind(m.tokens.map(|x| x as i64))
    .bind(m.thinking.map(|x| x as i64))
    .bind(&m.thinking_content)
    .bind(m.edited.map(|x| x as i64))
    .bind(&tool_calls_json)
    .bind(&m.tool_call_id)
    .bind(&m.tool_name)
    .bind(m.tool_status.map(|x| x as i64))
    .bind(&m.tool_method)
    .bind(&m.tool_url)
    .bind(m.tool_elapsed_ms.map(|x| x as i64))
    .bind(m.tool_body_bytes.map(|x| x as i64))
    .bind(m.tool_truncated.map(|x| x as i64))
    .bind(&attachments_json)
    .bind(sort_order as i64)
    .execute(executor)
    .await
    .map_err(|e| format!("插入 message {} 失败: {}", m.id, e))?;

    Ok(())
}

async fn migrate_session_compactions(session_id: &str, comp_dir: &Path) -> Result<usize, String> {
    let index_path = comp_dir.join("index.json");
    if !index_path.exists() {
        return Ok(0);
    }
    let raw = fs::read_to_string(&index_path)
        .map_err(|e| format!("读取 {:?} 失败: {}", index_path, e))?;
    let index: CompactionIndex = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 {:?} 失败: {}", index_path, e))?;

    let pool = pool();
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("获取连接失败: {}", e))?;
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("开启事务失败: {}", e))?;

    let mut count = 0usize;
    for meta in &index.versions {
        let content_path = comp_dir.join(format!("{}.md", meta.version));
        // 如果某个版本的 markdown 文件缺失，content 留空但仍写入元数据
        let content = fs::read_to_string(&content_path).unwrap_or_default();

        sqlx::query(
            "INSERT INTO chat_compactions (
                session_id, version, content, created_at,
                source_message_count, tail_kept, char_count, model
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, version) DO NOTHING",
        )
        .bind(session_id)
        .bind(&meta.version)
        .bind(&content)
        .bind(&meta.created_at)
        .bind(meta.source_message_count as i64)
        .bind(meta.tail_kept as i64)
        .bind(meta.char_count as i64)
        .bind(&meta.model)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("插入 compaction 失败: {}", e))?;
        count += 1;
    }

    tx.commit()
        .await
        .map_err(|e| format!("提交 compactions 事务失败: {}", e))?;
    Ok(count)
}

// ============ Clipboard ============

pub async fn migrate_clipboard(data_dir: &Path) -> Result<(), String> {
    let path = data_dir.join("clipboard_history.json");
    if !path.exists() {
        log::debug!("clipboard_history.json 不存在，跳过");
        return Ok(());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("读取 clipboard_history.json 失败: {}", e))?;
    let entries: Vec<ClipboardEntry> = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 clipboard_history.json 失败: {}", e))?;

    let pool = pool();
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("获取连接失败: {}", e))?;
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("开启事务失败: {}", e))?;

    for e in &entries {
        sqlx::query(
            "INSERT INTO clipboard_entries (
                id, content, content_preview, timestamp, pinned, char_count, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING",
        )
        .bind(&e.id)
        .bind(&e.content)
        .bind(&e.content_preview)
        .bind(e.timestamp)
        .bind(e.pinned as i64)
        .bind(e.char_count as i64)
        .bind(&e.note)
        .execute(&mut *tx)
        .await
        .map_err(|err| format!("插入 clipboard 条目 {} 失败: {}", e.id, err))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("提交 clipboard 事务失败: {}", e))?;
    log::info!("迁移 clipboard: {} 条", entries.len());
    Ok(())
}

// ============ Stats ============

pub async fn migrate_stats(data_dir: &Path) -> Result<(), String> {
    let path = data_dir.join("stats_cache.json");
    if !path.exists() {
        log::debug!("stats_cache.json 不存在，跳过");
        return Ok(());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("读取 stats_cache.json 失败: {}", e))?;
    let cache: crate::commands::stats::PersistedStatsCache = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 stats_cache.json 失败: {}", e))?;

    let pool = pool();
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("获取连接失败: {}", e))?;
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("开启事务失败: {}", e))?;

    let project_count = cache.project_stats.len();

    for (proj_path, ps) in &cache.project_stats {
        sqlx::query(
            "INSERT INTO project_stats (project_path, unpushed, last_updated)
             VALUES (?, ?, ?)
             ON CONFLICT(project_path) DO NOTHING",
        )
        .bind(proj_path)
        .bind(ps.unpushed as i64)
        .bind(ps.last_updated)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("插入 project_stats {} 失败: {}", proj_path, e))?;

        for (date, count) in &ps.commits_by_date {
            sqlx::query(
                "INSERT INTO project_stats_commits_by_date (project_path, date, count)
                 VALUES (?, ?, ?)
                 ON CONFLICT(project_path, date) DO NOTHING",
            )
            .bind(proj_path)
            .bind(date)
            .bind(*count as i64)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("插入 commits_by_date 失败: {}", e))?;
        }

        for (idx, rc) in ps.recent_commits.iter().enumerate() {
            sqlx::query(
                "INSERT INTO project_stats_recent_commits (
                    project_path, sort_order, hash, short_hash, message,
                    author, email, date, project_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_path, sort_order) DO NOTHING",
            )
            .bind(proj_path)
            .bind(idx as i64)
            .bind(&rc.hash)
            .bind(&rc.short_hash)
            .bind(&rc.message)
            .bind(&rc.author)
            .bind(&rc.email)
            .bind(&rc.date)
            .bind(&rc.project_name)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("插入 recent_commits 失败: {}", e))?;
        }
    }

    for dp in &cache.dirty_projects {
        sqlx::query("INSERT INTO stats_dirty (project_path) VALUES (?) ON CONFLICT DO NOTHING")
            .bind(dp)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("插入 stats_dirty 失败: {}", e))?;
    }

    // dashboard 聚合数据 + last_updated 存到 stats_meta（key-value）
    let dashboard_json = serde_json::to_string(&cache.data)
        .map_err(|e| format!("序列化 dashboard 失败: {}", e))?;
    sqlx::query(
        "INSERT INTO stats_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind("dashboard")
    .bind(&dashboard_json)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("插入 stats_meta dashboard 失败: {}", e))?;

    sqlx::query(
        "INSERT INTO stats_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind("last_updated")
    .bind(cache.last_updated.to_string())
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("插入 stats_meta last_updated 失败: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("提交 stats 事务失败: {}", e))?;
    log::info!("迁移 stats: {} 个项目", project_count);
    Ok(())
}

// ============ 标记完成 ============

/// 给已成功迁移的 JSON 文件 / 目录加 .migrated 后缀。
/// 出错只 log 不返回错误：迁移已经成功，重命名失败不应让整体回滚。
pub fn mark_files_migrated(data_dir: &Path) -> Result<(), String> {
    let files: &[&str] = &[
        "projects.json",
        "clipboard_history.json",
        "stats_cache.json",
    ];
    for name in files {
        let src = data_dir.join(name);
        if src.exists() {
            let dst = data_dir.join(format!("{}.migrated", name));
            // 如果 .migrated 已存在（旧的失败迁移残留），先删除
            if dst.exists() {
                let _ = fs::remove_file(&dst);
            }
            if let Err(e) = fs::rename(&src, &dst) {
                log::warn!("重命名 {} 失败（数据已成功迁移，可忽略）: {}", name, e);
            }
        }
    }

    let conv = data_dir.join("conversations");
    if conv.exists() {
        let dst = data_dir.join("conversations.migrated");
        if dst.exists() {
            let _ = fs::remove_dir_all(&dst);
        }
        if let Err(e) = fs::rename(&conv, &dst) {
            log::warn!("重命名 conversations 目录失败（数据已成功迁移，可忽略）: {}", e);
        }
    }

    Ok(())
}
