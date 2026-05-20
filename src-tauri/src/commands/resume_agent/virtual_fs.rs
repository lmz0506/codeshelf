// Agent 内部的虚拟文件系统 + 三个内置工具 (read_file / write_file / ls)。
//
// 取代前端 deepagents 内置的 fs 抽象。整个生命周期都在内存里,不落盘。
// 工具 schema 跟 OpenAI function-calling 协议对齐 (JSON Schema)。
//
// 设计取舍:
// - 不抽象 trait/dyn,直接 dispatch (这两个工具用法固定)。
// - 路径不做 normalize (LLM 会按 prompt 里给的形式调用,例如 "/resume.json")。

use std::collections::HashMap;

use serde_json::{json, Value};

use super::llm::{ToolCall, ToolDef};

#[derive(Debug, Clone)]
pub struct VirtualFile {
    pub content: String,
    pub mime_type: String,
    pub created_at: String,
    pub modified_at: String,
}

impl VirtualFile {
    pub fn new_markdown(content: impl Into<String>, ts_iso: impl Into<String>) -> Self {
        let ts = ts_iso.into();
        Self {
            content: content.into(),
            mime_type: "text/markdown".into(),
            created_at: ts.clone(),
            modified_at: ts,
        }
    }
}

pub fn builtin_tools() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "read_file".into(),
            description: "Read the full content of a file from the virtual filesystem. Use the exact path provided in the system message (paths start with '/').".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path of the file in the virtual filesystem, e.g. '/knowledge/abc.md'."
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "write_file".into(),
            description: "Write (create or overwrite) a file in the virtual filesystem.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to write, e.g. '/resume.json'."
                    },
                    "content": {
                        "type": "string",
                        "description": "Full content to write."
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDef {
            name: "ls".into(),
            description: "List every file path currently present in the virtual filesystem.".into(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
    ]
}

/// 执行一个内置工具。返回值是要 echo 回 LLM 的 tool result 字符串。
/// 错误以 `Error: ...` 字符串形式返回,让 LLM 看到并自我纠正,而不是 abort 整个 agent。
pub fn execute_builtin_tool(
    files: &mut HashMap<String, VirtualFile>,
    call: &ToolCall,
    now_iso: &str,
) -> String {
    let args: Value = match serde_json::from_str(&call.arguments_raw) {
        Ok(v) => v,
        Err(e) => return format!("Error: arguments not valid JSON: {}", e),
    };
    match call.name.as_str() {
        "read_file" => {
            let Some(path) = args.get("path").and_then(|v| v.as_str()) else {
                return "Error: missing 'path' argument".to_string();
            };
            match files.get(path) {
                Some(f) => f.content.clone(),
                None => format!("Error: file not found: {}", path),
            }
        }
        "write_file" => {
            let Some(path) = args.get("path").and_then(|v| v.as_str()) else {
                return "Error: missing 'path' argument".to_string();
            };
            let Some(content) = args.get("content").and_then(|v| v.as_str()) else {
                return "Error: missing 'content' argument".to_string();
            };
            let bytes = content.len();
            let existing = files.get(path).cloned();
            let file = VirtualFile {
                content: content.to_string(),
                mime_type: existing
                    .as_ref()
                    .map(|f| f.mime_type.clone())
                    .unwrap_or_else(|| "text/plain".into()),
                created_at: existing
                    .as_ref()
                    .map(|f| f.created_at.clone())
                    .unwrap_or_else(|| now_iso.to_string()),
                modified_at: now_iso.to_string(),
            };
            files.insert(path.to_string(), file);
            format!("Wrote {} bytes to {}", bytes, path)
        }
        "ls" => {
            let mut paths: Vec<&String> = files.keys().collect();
            paths.sort();
            if paths.is_empty() {
                "(empty)".to_string()
            } else {
                paths
                    .iter()
                    .map(|p| p.as_str())
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
        other => format!("Error: unknown tool '{}'", other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(name: &str, args: Value) -> ToolCall {
        ToolCall {
            id: "call_1".into(),
            name: name.into(),
            arguments_raw: args.to_string(),
        }
    }

    #[test]
    fn write_then_read_roundtrip() {
        let mut files = HashMap::new();
        let now = "2026-05-20T00:00:00Z";
        let written = execute_builtin_tool(
            &mut files,
            &call("write_file", json!({"path": "/a.md", "content": "hello"})),
            now,
        );
        assert!(written.starts_with("Wrote 5 bytes"));
        let read = execute_builtin_tool(
            &mut files,
            &call("read_file", json!({"path": "/a.md"})),
            now,
        );
        assert_eq!(read, "hello");
    }

    #[test]
    fn read_missing_returns_error_string_not_panic() {
        let mut files = HashMap::new();
        let r = execute_builtin_tool(
            &mut files,
            &call("read_file", json!({"path": "/nope.md"})),
            "now",
        );
        assert!(r.starts_with("Error: file not found"));
    }

    #[test]
    fn ls_lists_in_sorted_order() {
        let mut files = HashMap::new();
        let now = "n";
        execute_builtin_tool(
            &mut files,
            &call("write_file", json!({"path": "/b.md", "content": "x"})),
            now,
        );
        execute_builtin_tool(
            &mut files,
            &call("write_file", json!({"path": "/a.md", "content": "y"})),
            now,
        );
        let listing = execute_builtin_tool(&mut files, &call("ls", json!({})), now);
        assert_eq!(listing, "/a.md\n/b.md");
    }

    #[test]
    fn unknown_tool_returns_error_string() {
        let mut files = HashMap::new();
        let r = execute_builtin_tool(&mut files, &call("nope", json!({})), "n");
        assert!(r.starts_with("Error: unknown tool"));
    }

    #[test]
    fn write_preserves_created_at_on_update() {
        let mut files = HashMap::new();
        execute_builtin_tool(
            &mut files,
            &call("write_file", json!({"path": "/a", "content": "1"})),
            "t1",
        );
        execute_builtin_tool(
            &mut files,
            &call("write_file", json!({"path": "/a", "content": "22"})),
            "t2",
        );
        let f = files.get("/a").unwrap();
        assert_eq!(f.created_at, "t1");
        assert_eq!(f.modified_at, "t2");
        assert_eq!(f.content, "22");
    }
}
