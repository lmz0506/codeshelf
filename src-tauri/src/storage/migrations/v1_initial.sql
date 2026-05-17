-- v1 初始 schema：projects / chat / clipboard / stats 共 13 张表
-- 通过 sqlx::raw_sql 一次性执行
-- 注意：bool 用 INTEGER (0/1)；时间戳保持与 Rust struct 字段同类型
--   - projects / chat 用 ISO 8601 字符串
--   - clipboard.timestamp 用 unix milliseconds (i64)
--   - stats.last_updated 用 unix seconds (i64)

-- ============ Projects ============

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened TEXT,
    editor_id TEXT,
    claude_env_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_favorite ON projects(is_favorite, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened);

CREATE TABLE IF NOT EXISTS project_tags (
    project_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (project_id, tag),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_labels (
    project_id TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (project_id, label),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============ Chat ============

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    system_prompt TEXT,
    temperature REAL,
    max_tokens INTEGER,
    top_p REAL,
    frequency_penalty REAL,
    presence_penalty REAL,
    pinned INTEGER,
    allowed_cwd TEXT,
    use_mcp_gateway_tools INTEGER,
    current_compaction_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_pinned ON chat_sessions(pinned, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    tokens INTEGER,
    thinking INTEGER,
    thinking_content TEXT,
    edited INTEGER,
    tool_calls_json TEXT,
    tool_call_id TEXT,
    tool_name TEXT,
    tool_status INTEGER,
    tool_method TEXT,
    tool_url TEXT,
    tool_elapsed_ms INTEGER,
    tool_body_bytes INTEGER,
    tool_truncated INTEGER,
    attachments_json TEXT,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, sort_order);

CREATE TABLE IF NOT EXISTS chat_session_tools (
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    is_allowed INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, tool_name),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_compactions (
    session_id TEXT NOT NULL,
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source_message_count INTEGER NOT NULL,
    tail_kept INTEGER NOT NULL,
    char_count INTEGER NOT NULL,
    model TEXT,
    PRIMARY KEY (session_id, version),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- ============ Clipboard ============

CREATE TABLE IF NOT EXISTS clipboard_entries (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    content_preview TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_clipboard_timestamp ON clipboard_entries(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_clipboard_pinned_ts ON clipboard_entries(pinned DESC, timestamp DESC);

-- ============ Stats ============

CREATE TABLE IF NOT EXISTS project_stats (
    project_path TEXT PRIMARY KEY,
    unpushed INTEGER NOT NULL DEFAULT 0,
    last_updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_stats_commits_by_date (
    project_path TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (project_path, date),
    FOREIGN KEY (project_path) REFERENCES project_stats(project_path) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_stats_recent_commits (
    project_path TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    hash TEXT NOT NULL,
    short_hash TEXT NOT NULL,
    message TEXT NOT NULL,
    author TEXT NOT NULL,
    email TEXT NOT NULL,
    date TEXT NOT NULL,
    project_name TEXT NOT NULL,
    PRIMARY KEY (project_path, sort_order),
    FOREIGN KEY (project_path) REFERENCES project_stats(project_path) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stats_dirty (
    project_path TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS stats_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
