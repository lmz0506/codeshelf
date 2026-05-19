//! WebFetch 工具：HTTP(S) 抓取，自动识别 HTML/JSON/纯文本/二进制并做对应处理。
//! 工作流模块也直接复用 `run_web_fetch_for_workflow`。

use crate::error::AppResult;
use serde_json::Value;

pub(super) async fn tool_web_fetch(args: &Value) -> AppResult<String> {
    run_web_fetch(args).await
}

/// 供工作流模块调用
pub async fn run_web_fetch_for_workflow(args: &Value) -> AppResult<String> {
    run_web_fetch(args).await
}

async fn run_web_fetch(args: &Value) -> AppResult<String> {
    let url = args
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("缺少 url")?
        .trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("仅支持 http/https URL".into());
    }
    let max_bytes = args
        .get("max_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(500_000)
        .min(2_000_000) as usize;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("codeshelf/0.1 (+https://github.com/)")
        .build()
        .map_err(|e| crate::error::AppError::from(format!("客户端构建失败: {}", e)))?;

    let mut req = client.get(url);
    if let Some(headers) = args.get("headers").and_then(|v| v.as_object()) {
        for (k, v) in headers {
            if let Some(val) = v.as_str() {
                req = req.header(k.as_str(), val);
            }
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|e| crate::error::AppError::from(format!("请求失败: {}", e)))?;
    let status = resp.status();
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| crate::error::AppError::from(format!("读取响应失败: {}", e)))?;
    let total_len = bytes.len();
    let truncated = total_len > max_bytes;
    let slice = &bytes[..total_len.min(max_bytes)];

    let ct_lower = content_type.to_lowercase();
    let is_binary_ct = [
        "image/",
        "audio/",
        "video/",
        "application/octet-stream",
        "application/pdf",
        "application/zip",
        "application/gzip",
        "application/x-tar",
        "application/x-7z",
        "application/x-rar",
    ]
    .iter()
    .any(|p| ct_lower.starts_with(p) || ct_lower.contains(p));

    let body = if is_binary_ct {
        format!(
            "（二进制内容，Content-Type={}，大小={} 字节，已跳过正文）",
            content_type, total_len
        )
    } else if ct_lower.contains("application/json") || ct_lower.contains("+json") {
        let raw = String::from_utf8_lossy(slice).to_string();
        match serde_json::from_str::<Value>(&raw) {
            Ok(v) => serde_json::to_string_pretty(&v).unwrap_or(raw),
            Err(_) => raw,
        }
    } else {
        let raw = String::from_utf8_lossy(slice).to_string();
        let looks_html = ct_lower.contains("text/html")
            || ct_lower.contains("application/xhtml")
            || (ct_lower.is_empty() && raw.trim_start().starts_with('<'));
        if looks_html {
            html_to_text(&raw)
        } else {
            raw
        }
    };

    let trailer = if truncated && !is_binary_ct {
        format!(
            "\n\n[已截断，原始 {} 字节；max_bytes={}]",
            total_len, max_bytes
        )
    } else {
        String::new()
    };
    Ok(format!(
        "[WebFetch {}]\nURL: {}\nContent-Type: {}\nSize: {} bytes\n\n{}{}",
        status.as_u16(),
        final_url,
        content_type,
        total_len,
        body,
        trailer
    ))
}

/// 最朴素的 HTML → 纯文本转换：去 <script>/<style>，再剥标签、折叠空白。
fn html_to_text(html: &str) -> String {
    let mut s = html.to_string();
    for tag in ["script", "style", "noscript"] {
        loop {
            let open = format!("<{}", tag);
            let close = format!("</{}>", tag);
            let lower = s.to_lowercase();
            let Some(start) = lower.find(&open) else {
                break;
            };
            let Some(end_rel) = lower[start..].find(&close) else {
                break;
            };
            let end = start + end_rel + close.len();
            s.replace_range(start..end, "");
        }
    }
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    let out = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    let mut lines: Vec<&str> = out
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    lines.dedup();
    lines.join("\n")
}
