//! Memory / Skills / Mention 相关后端命令

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::storage::get_storage_config;

// ========== Memory ==========

#[tauri::command]
pub async fn get_global_memory() -> Result<String, String> {
    let config = get_storage_config()?;
    let path = config.memory_file();
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取 MEMORY 失败: {}", e))
}

#[tauri::command]
pub async fn save_global_memory(content: String) -> Result<(), String> {
    let config = get_storage_config()?;
    let path = config.memory_file();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("保存失败: {}", e))
}

// ========== Skills ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub args_hint: Option<String>,
    pub body: String,
}

fn parse_skill(text: &str, default_name: &str) -> Skill {
    // 极简 frontmatter 解析：若以 "---\n" 开头则读取 key: value 行
    let mut name = default_name.to_string();
    let mut description = String::new();
    let mut args_hint: Option<String> = None;
    let mut body = text.to_string();
    if let Some(rest) = text.strip_prefix("---\n") {
        if let Some(end_idx) = rest.find("\n---\n") {
            let front = &rest[..end_idx];
            body = rest[end_idx + 5..].to_string();
            for line in front.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let key = k.trim();
                    let value = v.trim().trim_matches('"').to_string();
                    match key {
                        "name" => name = value,
                        "description" => description = value,
                        "args" | "argsHint" => args_hint = Some(value),
                        _ => {}
                    }
                }
            }
        }
    }
    Skill { name, description, args_hint, body }
}

fn bundled_skills() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "code-review.md",
            r#"---
name: code-review
description: 对当前引用文件/仓库做代码审查，指出风险与改进点
args: "[files]"
---
请以资深工程师视角审查以下代码：

{args}

关注：
- 明显 bug、边界条件、错误处理缺失
- 安全漏洞（输入校验、注入、鉴权）
- 性能热点
- 可读性与命名
- 是否可以复用已有工具/函数避免重复实现

按"严重度：should-fix / nice-to-have"分组输出，每条给出文件/行号定位。
"#,
        ),
        (
            "commit-message.md",
            r#"---
name: commit-message
description: 根据 git diff 生成符合 Conventional Commits 的中文提交信息
args: "[optional scope]"
---
阅读当前仓库的 `git diff --staged`，用 Conventional Commits 规范生成一条简短中文提交信息。
要求：
- 首行 ≤ 50 字符，格式 `<type>(<scope>): <summary>`
- 正文（可选）解释 why 而非 what
- 若 {args} 非空，用它作为 scope
"#,
        ),
        (
            "debug.md",
            r#"---
name: debug
description: 定位一个问题：通读相关代码/日志，给出根因与修复建议
args: "[现象/错误信息]"
---
问题现象：{args}

请：
1. 使用 Grep/Read 工具搜索相关代码
2. 用最小因果链解释为什么会出现该现象
3. 给出修复建议，必要时用 Edit 工具写补丁
"#,
        ),
        (
            "translate-readme.md",
            r#"---
name: translate-readme
description: 将 README.md 翻译为指定语言
args: "<目标语言>，如 en / ja"
---
阅读项目根目录的 `README.md` 并翻译为 {args}。
- 保留 markdown 结构与代码块
- 技术术语保留原文
- 命令、路径不翻译
翻译完成后写入 `README.{args}.md`。
"#,
        ),
    ]
}

fn ensure_skills_dir() -> Result<std::path::PathBuf, String> {
    let config = get_storage_config()?;
    let dir = config.skills_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
        // 首次初始化：拷贝 bundled
        for (fname, body) in bundled_skills() {
            let p = dir.join(fname);
            if !p.exists() {
                let _ = fs::write(&p, body);
            }
        }
    }
    Ok(dir)
}

#[tauri::command]
pub async fn list_skills() -> Result<Vec<Skill>, String> {
    let dir = ensure_skills_dir()?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("读取失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取失败: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let default_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("skill")
            .to_string();
        let text = fs::read_to_string(&path).unwrap_or_default();
        out.push(parse_skill(&text, &default_name));
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub async fn save_skill(skill: Skill) -> Result<(), String> {
    let dir = ensure_skills_dir()?;
    let fname = format!("{}.md", sanitize_name(&skill.name));
    let path = dir.join(fname);
    let content = format!(
        "---\nname: {}\ndescription: {}\nargs: {}\n---\n{}",
        skill.name,
        skill.description,
        skill.args_hint.as_deref().unwrap_or(""),
        skill.body
    );
    fs::write(&path, content).map_err(|e| format!("保存失败: {}", e))
}

#[tauri::command]
pub async fn delete_skill(name: String) -> Result<(), String> {
    let dir = ensure_skills_dir()?;
    let fname = format!("{}.md", sanitize_name(&name));
    let path = dir.join(fname);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("删除失败: {}", e))?;
    }
    Ok(())
}

fn sanitize_name(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect()
}

// ========== 文件 @mention：读取文件内容（相对指定根目录） ==========

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MentionFileEntry {
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub async fn list_dir_entries(root: String, max: Option<u32>) -> Result<Vec<MentionFileEntry>, String> {
    let cap = max.unwrap_or(500) as usize;
    let mut out: Vec<MentionFileEntry> = Vec::new();
    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Err("目录不存在".into());
    }
    walk_for_mention(root_path, root_path, &mut out, cap, 0)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn walk_for_mention(
    base: &Path,
    dir: &Path,
    out: &mut Vec<MentionFileEntry>,
    cap: usize,
    depth: u32,
) -> Result<(), String> {
    if out.len() >= cap || depth > 8 {
        return Ok(());
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        if out.len() >= cap {
            return Ok(());
        }
        let path = entry.path();
        let fname = entry.file_name().to_string_lossy().to_string();
        if fname.starts_with('.')
            || matches!(
                fname.as_str(),
                "node_modules" | "target" | "dist" | "build" | ".next" | ".cache"
            )
        {
            continue;
        }
        let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        let is_dir = path.is_dir();
        out.push(MentionFileEntry {
            path: rel.clone(),
            is_dir,
        });
        if is_dir {
            walk_for_mention(base, &path, out, cap, depth + 1)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn read_mention_file(root: String, rel_path: String) -> Result<String, String> {
    let root_canon = fs::canonicalize(&root).map_err(|e| format!("根目录无效: {}", e))?;
    let full = root_canon.join(&rel_path);
    let canon = fs::canonicalize(&full).map_err(|e| format!("路径无效: {}", e))?;
    if !canon.starts_with(&root_canon) {
        return Err("路径越界".into());
    }
    let meta = fs::metadata(&canon).map_err(|e| format!("读取元信息失败: {}", e))?;
    if meta.len() > 200_000 {
        return Err(format!("文件过大（{} 字节），拒绝注入", meta.len()));
    }
    fs::read_to_string(&canon).map_err(|e| format!("读取失败: {}", e))
}
