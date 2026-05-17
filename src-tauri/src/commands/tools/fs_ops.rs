//! Read / Write / Edit / Glob / Grep —— allowedCwd 沙箱内的文件系统操作。

use crate::error::AppResult;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::ctx::{require_under_cwd, truncate, ToolCtx};

pub(super) fn tool_read(ctx: &ToolCtx, args: &Value) -> AppResult<String> {
    let path_str = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let path = require_under_cwd(ctx, Path::new(path_str))?;
    let text = fs::read_to_string(&path).map_err(|e| crate::error::AppError::from(format!("读取失败: {}", e)))?;
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(2000) as usize;
    let lines: Vec<&str> = text.lines().collect();
    let start = offset.saturating_sub(1);
    let end = (start + limit).min(lines.len());
    let mut out = String::new();
    for (i, line) in lines[start..end].iter().enumerate() {
        out.push_str(&format!("{:>6}\t{}\n", start + i + 1, line));
    }
    Ok(truncate(out, 200_000))
}

pub(super) fn tool_write(ctx: &ToolCtx, args: &Value) -> AppResult<String> {
    let path_str = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("缺少 content")?;
    let path = require_under_cwd(ctx, Path::new(path_str))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| crate::error::AppError::from(format!("创建目录失败: {}", e)))?;
    }
    fs::write(&path, content).map_err(|e| crate::error::AppError::from(format!("写入失败: {}", e)))?;
    Ok(format!("已写入 {}（{} 字节）", path.display(), content.len()))
}

pub(super) fn tool_edit(ctx: &ToolCtx, args: &Value) -> AppResult<String> {
    let path_str = args.get("path").and_then(|v| v.as_str()).ok_or("缺少 path")?;
    let old = args
        .get("oldString")
        .and_then(|v| v.as_str())
        .ok_or("缺少 oldString")?;
    let new = args
        .get("newString")
        .and_then(|v| v.as_str())
        .ok_or("缺少 newString")?;
    let path = require_under_cwd(ctx, Path::new(path_str))?;
    let text = fs::read_to_string(&path).map_err(|e| crate::error::AppError::from(format!("读取失败: {}", e)))?;
    let occurrences = text.matches(old).count();
    if occurrences == 0 {
        return Err("oldString 未在文件中找到".into());
    }
    if occurrences > 1 {
        return Err(crate::error::AppError::from(format!("oldString 出现 {} 次，必须唯一", occurrences)));
    }
    let updated = text.replacen(old, new, 1);
    fs::write(&path, &updated).map_err(|e| crate::error::AppError::from(format!("写入失败: {}", e)))?;
    Ok(format!("已替换 {} 中 1 处", path.display()))
}

// ========== glob/grep + 极简正则 ==========

fn glob_walk(root: &Path, pattern: &str) -> AppResult<Vec<PathBuf>> {
    let regex_src = glob_to_regex(pattern);
    let re = regex_lite(&regex_src)?;
    let mut out = Vec::new();
    walk_dir(root, root, &re, &mut out, 0)?;
    out.sort();
    Ok(out)
}

fn walk_dir(
    base: &Path,
    dir: &Path,
    re: &SimpleRegex,
    out: &mut Vec<PathBuf>,
    depth: u32,
) -> AppResult<()> {
    if depth > 16 {
        return Ok(());
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let fname = entry.file_name().to_string_lossy().to_string();
        if path.is_dir()
            && matches!(
                fname.as_str(),
                "node_modules" | ".git" | "target" | "dist" | ".next" | "build" | ".cache"
            )
        {
            continue;
        }
        if path.is_dir() {
            walk_dir(base, &path, re, out, depth + 1)?;
        } else if let Ok(rel) = path.strip_prefix(base) {
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            if re.matches(&rel_str) {
                out.push(rel.to_path_buf());
            }
        }
    }
    Ok(())
}

/// 极简 glob->regex：支持 **, *, ? 和字面字符
fn glob_to_regex(pattern: &str) -> String {
    let mut out = String::from("^");
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' => {
                if chars.peek() == Some(&'*') {
                    chars.next();
                    if chars.peek() == Some(&'/') {
                        chars.next();
                    }
                    out.push_str(".*");
                } else {
                    out.push_str("[^/]*");
                }
            }
            '?' => out.push_str("[^/]"),
            '.' | '+' | '(' | ')' | '|' | '^' | '$' | '{' | '}' | '[' | ']' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out.push('$');
    out
}

/// 超极简"正则"：只实现 `.*`、`[^/]*`、`[^/]`、字面字符、锚点，用于 glob 场景，
/// 避免引入 regex crate。
struct SimpleRegex {
    tokens: Vec<RegexTok>,
}
enum RegexTok {
    Lit(String),
    AnyExceptSlash,  // [^/]
    StarExceptSlash, // [^/]*
    DotStar,         // .*
}

fn regex_lite(src: &str) -> AppResult<SimpleRegex> {
    let bytes = src.as_bytes();
    let mut i = 0;
    let mut tokens = Vec::new();
    if bytes.first() != Some(&b'^') {
        return Err("regex must start with ^".into());
    }
    i += 1;
    let end = bytes.len().saturating_sub(1);
    while i < end {
        let b = bytes[i];
        if i + 1 < end && bytes[i] == b'.' && bytes[i + 1] == b'*' {
            tokens.push(RegexTok::DotStar);
            i += 2;
        } else if i + 4 < end
            && bytes[i] == b'['
            && bytes[i + 1] == b'^'
            && bytes[i + 2] == b'/'
            && bytes[i + 3] == b']'
            && bytes[i + 4] == b'*'
        {
            tokens.push(RegexTok::StarExceptSlash);
            i += 5;
        } else if i + 3 < end
            && bytes[i] == b'['
            && bytes[i + 1] == b'^'
            && bytes[i + 2] == b'/'
            && bytes[i + 3] == b']'
        {
            tokens.push(RegexTok::AnyExceptSlash);
            i += 4;
        } else if b == b'\\' && i + 1 < end {
            if let Some(RegexTok::Lit(ref mut s)) = tokens.last_mut() {
                s.push(bytes[i + 1] as char);
            } else {
                tokens.push(RegexTok::Lit((bytes[i + 1] as char).to_string()));
            }
            i += 2;
        } else {
            if let Some(RegexTok::Lit(ref mut s)) = tokens.last_mut() {
                s.push(b as char);
            } else {
                tokens.push(RegexTok::Lit((b as char).to_string()));
            }
            i += 1;
        }
    }
    Ok(SimpleRegex { tokens })
}

impl SimpleRegex {
    fn matches(&self, input: &str) -> bool {
        self.match_tokens(&self.tokens, input)
    }
    fn match_tokens(&self, toks: &[RegexTok], s: &str) -> bool {
        if toks.is_empty() {
            return s.is_empty();
        }
        match &toks[0] {
            RegexTok::Lit(lit) => {
                s.starts_with(lit.as_str()) && self.match_tokens(&toks[1..], &s[lit.len()..])
            }
            RegexTok::AnyExceptSlash => {
                let mut it = s.chars();
                match it.next() {
                    Some(c) if c != '/' => self.match_tokens(&toks[1..], it.as_str()),
                    _ => false,
                }
            }
            RegexTok::StarExceptSlash => {
                for i in 0..=s.len() {
                    if s.as_bytes().iter().take(i).any(|b| *b == b'/') {
                        return false;
                    }
                    if self.match_tokens(&toks[1..], &s[i..]) {
                        return true;
                    }
                }
                false
            }
            RegexTok::DotStar => {
                for i in 0..=s.len() {
                    if self.match_tokens(&toks[1..], &s[i..]) {
                        return true;
                    }
                }
                false
            }
        }
    }
}

pub(super) fn tool_glob(ctx: &ToolCtx, args: &Value) -> AppResult<String> {
    let pattern = args
        .get("pattern")
        .and_then(|v| v.as_str())
        .ok_or("缺少 pattern")?;
    let base = ctx
        .allowed_cwd
        .as_ref()
        .ok_or("会话未设置 allowedCwd")?;
    let base_canon = fs::canonicalize(base).map_err(|e| crate::error::AppError::from(format!("allowedCwd 无效: {}", e)))?;
    let files = glob_walk(&base_canon, pattern)?;
    if files.is_empty() {
        return Ok("（无匹配）".into());
    }
    let mut out = String::new();
    for f in files.iter().take(500) {
        out.push_str(&f.to_string_lossy());
        out.push('\n');
    }
    if files.len() > 500 {
        out.push_str(&format!("… 共 {} 个匹配，只展示前 500\n", files.len()));
    }
    Ok(out)
}

pub(super) fn tool_grep(ctx: &ToolCtx, args: &Value) -> AppResult<String> {
    let pattern = args
        .get("pattern")
        .and_then(|v| v.as_str())
        .ok_or("缺少 pattern")?;
    let glob = args.get("glob").and_then(|v| v.as_str()).unwrap_or("**/*");
    let base = ctx
        .allowed_cwd
        .as_ref()
        .ok_or("会话未设置 allowedCwd")?;
    let base_canon = fs::canonicalize(base).map_err(|e| crate::error::AppError::from(format!("allowedCwd 无效: {}", e)))?;
    let files = glob_walk(&base_canon, glob)?;
    let mut out = String::new();
    let mut hits = 0;
    for rel in files.iter() {
        let path = base_canon.join(rel);
        if path.metadata().map(|m| m.len() > 1_000_000).unwrap_or(true) {
            continue;
        }
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => continue,
        };
        for (i, line) in text.lines().enumerate() {
            if line.contains(pattern) {
                out.push_str(&format!("{}:{}: {}\n", rel.display(), i + 1, line.trim()));
                hits += 1;
                if hits >= 200 {
                    out.push_str("… 结果已截断至 200 行\n");
                    return Ok(out);
                }
            }
        }
    }
    if hits == 0 {
        Ok("（无匹配）".into())
    } else {
        Ok(out)
    }
}
