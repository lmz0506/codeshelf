use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerStatus {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerCommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageInfo {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_since: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerInfo {
    pub id: String,
    pub image: String,
    pub names: String,
    pub status: String,
    pub ports: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerBuildInput {
    pub project_path: String,
    pub dockerfile_path: String,
    pub image_name: String,
    pub tag: Option<String>,
    pub no_cache: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerRunInput {
    pub image: String,
    pub container_name: Option<String>,
    pub ports: Option<Vec<String>>,
    pub env: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerAiGenerateInput {
    pub project_path: String,
    pub dockerfile_path: Option<String>,
    pub image_name: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerAiGenerateOutput {
    pub content: String,
    pub provider_name: String,
    pub model_name: String,
}

fn run_docker(args: &[&str], cwd: Option<&Path>) -> DockerCommandResult {
    let mut command = Command::new("docker");
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let command_text = format!("docker {}", args.join(" "));

    match command.output() {
        Ok(output) => DockerCommandResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            command: command_text,
        },
        Err(e) => DockerCommandResult {
            success: false,
            stdout: String::new(),
            stderr: e.to_string(),
            command: command_text,
        },
    }
}

fn project_root(project_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(project_path).map_err(|e| format!("项目目录无效: {}", e))?;
    if !root.is_dir() {
        return Err("项目路径不是目录".into());
    }
    Ok(root)
}

fn resolve_project_file(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let rel = rel_path.trim_start_matches('/').trim();
    if rel.is_empty() {
        return Err("文件路径不能为空".into());
    }
    let full = root.join(rel);
    let parent = full.parent().ok_or_else(|| "文件路径无效".to_string())?;
    let parent_canon = if parent.exists() {
        fs::canonicalize(parent).map_err(|e| format!("父目录无效: {}", e))?
    } else {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        fs::canonicalize(parent).map_err(|e| format!("父目录无效: {}", e))?
    };
    if !parent_canon.starts_with(root) {
        return Err("路径越界".into());
    }
    Ok(full)
}

fn resolve_existing_project_file(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let rel = rel_path.trim_start_matches('/').trim();
    if rel.is_empty() {
        return Err("文件路径不能为空".into());
    }
    let full = root.join(rel);
    let canon = fs::canonicalize(&full).map_err(|e| format!("文件无效: {}", e))?;
    if !canon.starts_with(root) {
        return Err("路径越界".into());
    }
    Ok(canon)
}

fn walk_dockerfiles(base: &Path, dir: &Path, out: &mut Vec<String>, depth: u8) {
    if depth > 5 || out.len() >= 50 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || matches!(
                name.as_str(),
                "node_modules" | "target" | "dist" | "build" | ".next"
            )
        {
            continue;
        }
        if path.is_dir() {
            walk_dockerfiles(base, &path, out, depth + 1);
            continue;
        }
        let lower = name.to_lowercase();
        if lower == "dockerfile"
            || lower.starts_with("dockerfile.")
            || lower.ends_with(".dockerfile")
        {
            if let Ok(rel) = path.strip_prefix(base) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

fn walk_project_summary(base: &Path, dir: &Path, out: &mut Vec<String>, depth: u8) {
    if depth > 4 || out.len() >= 200 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || matches!(
                name.as_str(),
                "node_modules" | "target" | "dist" | "build" | ".next" | "coverage" | "vendor"
            )
        {
            continue;
        }
        if let Ok(rel) = path.strip_prefix(base) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
        if path.is_dir() {
            walk_project_summary(base, &path, out, depth + 1);
        }
    }
}

fn detect_template(root: &Path, requested: Option<&str>) -> String {
    if let Some(template) = requested {
        if template != "auto" {
            return template.to_string();
        }
    }
    if root.join("package.json").exists() {
        "node".into()
    } else if root.join("pom.xml").exists() {
        "java-maven".into()
    } else if root.join("Cargo.toml").exists() {
        "rust".into()
    } else if root.join("requirements.txt").exists() || root.join("pyproject.toml").exists() {
        "python".into()
    } else {
        "static-nginx".into()
    }
}

fn read_project_context(root: &Path) -> String {
    let mut files = Vec::new();
    walk_project_summary(root, root, &mut files, 0);
    files.sort();

    let manifest_names = [
        "package.json",
        "pom.xml",
        "build.gradle",
        "settings.gradle",
        "Cargo.toml",
        "requirements.txt",
        "pyproject.toml",
        "go.mod",
        "vite.config.ts",
        "vite.config.js",
        "next.config.js",
    ];
    let mut manifests = Vec::new();
    for name in manifest_names {
        let path = root.join(name);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(path) {
                let clipped = content.chars().take(4000).collect::<String>();
                manifests.push(format!("--- {} ---\n{}", name, clipped));
            }
        }
    }

    format!(
        "项目文件（最多 200 项）:\n{}\n\n关键配置文件:\n{}",
        files.join("\n"),
        manifests.join("\n\n")
    )
}

fn extract_dockerfile_content(text: &str) -> String {
    if let Some(start) = text.find("```") {
        let rest = &text[start + 3..];
        let rest = rest
            .strip_prefix("Dockerfile")
            .or_else(|| rest.strip_prefix("dockerfile"))
            .unwrap_or(rest)
            .trim_start_matches('\n');
        if let Some(end) = rest.find("```") {
            return rest[..end].trim().to_string();
        }
    }
    text.trim().to_string()
}

#[tauri::command]
pub async fn docker_check_available() -> Result<DockerStatus, String> {
    let result = run_docker(&["--version"], None);
    if result.success {
        Ok(DockerStatus {
            available: true,
            version: Some(result.stdout.trim().to_string()),
            error: None,
        })
    } else {
        Ok(DockerStatus {
            available: false,
            version: None,
            error: Some(result.stderr),
        })
    }
}

#[tauri::command]
pub async fn docker_find_dockerfiles(project_path: String) -> Result<Vec<String>, String> {
    let root = project_root(&project_path)?;
    let mut out = Vec::new();
    walk_dockerfiles(&root, &root, &mut out, 0);
    out.sort();
    Ok(out)
}

#[tauri::command]
pub async fn docker_read_dockerfile(
    project_path: String,
    dockerfile_path: String,
) -> Result<String, String> {
    let root = project_root(&project_path)?;
    let full = resolve_existing_project_file(&root, &dockerfile_path)?;
    fs::read_to_string(full).map_err(|e| format!("读取 Dockerfile 失败: {}", e))
}

#[tauri::command]
pub async fn docker_write_dockerfile(
    project_path: String,
    dockerfile_path: String,
    content: String,
) -> Result<(), String> {
    let root = project_root(&project_path)?;
    let full = resolve_project_file(&root, &dockerfile_path)?;
    fs::write(full, content).map_err(|e| format!("写入 Dockerfile 失败: {}", e))
}

#[tauri::command]
pub async fn docker_generate_dockerfile_template(
    project_path: String,
    template: Option<String>,
) -> Result<String, String> {
    let root = project_root(&project_path)?;
    let kind = detect_template(&root, template.as_deref());
    let content = match kind.as_str() {
        "node" => {
            r#"FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"#
        }
        "java-maven" => {
            r#"FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
"#
        }
        "rust" => {
            r#"FROM rust:1-bookworm AS build
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/target/release/app /usr/local/bin/app
CMD ["app"]
"#
        }
        "python" => {
            r#"FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]
"#
        }
        _ => {
            r#"FROM nginx:stable-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"#
        }
    };
    Ok(content.to_string())
}

#[tauri::command]
pub async fn docker_build_image(input: DockerBuildInput) -> Result<DockerCommandResult, String> {
    let root = project_root(&input.project_path)?;
    resolve_existing_project_file(&root, &input.dockerfile_path)?;
    let full_image = if input.image_name.contains(':') {
        input.image_name
    } else {
        format!(
            "{}:{}",
            input.image_name,
            input.tag.unwrap_or_else(|| "latest".into())
        )
    };
    let mut args = vec![
        "build",
        "-t",
        full_image.as_str(),
        "-f",
        input.dockerfile_path.as_str(),
    ];
    if input.no_cache.unwrap_or(false) {
        args.push("--no-cache");
    }
    args.push(".");
    Ok(run_docker(&args, Some(&root)))
}

#[tauri::command]
pub async fn docker_list_images() -> Result<Vec<DockerImageInfo>, String> {
    let result = run_docker(&["image", "ls", "--format", "{{json .}}"], None);
    if !result.success {
        return Err(result.stderr);
    }
    let mut out = Vec::new();
    for line in result.stdout.lines() {
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            out.push(DockerImageInfo {
                id: v["ID"].as_str().unwrap_or_default().to_string(),
                repository: v["Repository"].as_str().unwrap_or_default().to_string(),
                tag: v["Tag"].as_str().unwrap_or_default().to_string(),
                size: v["Size"].as_str().unwrap_or_default().to_string(),
                created_since: v["CreatedSince"].as_str().unwrap_or_default().to_string(),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn docker_remove_image(
    image: String,
    force: Option<bool>,
) -> Result<DockerCommandResult, String> {
    let mut args = vec!["rmi"];
    if force.unwrap_or(false) {
        args.push("-f");
    }
    args.push(image.as_str());
    Ok(run_docker(&args, None))
}

#[tauri::command]
pub async fn docker_run_image(input: DockerRunInput) -> Result<DockerCommandResult, String> {
    let mut args = vec!["run", "-d"];
    if let Some(name) = input
        .container_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        args.push("--name");
        args.push(name);
    }
    let ports = input.ports.unwrap_or_default();
    for port in &ports {
        if !port.trim().is_empty() {
            args.push("-p");
            args.push(port);
        }
    }
    let env = input.env.unwrap_or_default();
    for item in &env {
        if !item.trim().is_empty() {
            args.push("-e");
            args.push(item);
        }
    }
    args.push(input.image.as_str());
    Ok(run_docker(&args, None))
}

#[tauri::command]
pub async fn docker_list_containers() -> Result<Vec<DockerContainerInfo>, String> {
    let result = run_docker(&["ps", "-a", "--format", "{{json .}}"], None);
    if !result.success {
        return Err(result.stderr);
    }
    let mut out = Vec::new();
    for line in result.stdout.lines() {
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            out.push(DockerContainerInfo {
                id: v["ID"].as_str().unwrap_or_default().to_string(),
                image: v["Image"].as_str().unwrap_or_default().to_string(),
                names: v["Names"].as_str().unwrap_or_default().to_string(),
                status: v["Status"].as_str().unwrap_or_default().to_string(),
                ports: v["Ports"].as_str().unwrap_or_default().to_string(),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn docker_stop_container(container: String) -> Result<DockerCommandResult, String> {
    Ok(run_docker(&["stop", container.as_str()], None))
}

#[tauri::command]
pub async fn docker_remove_container(
    container: String,
    force: Option<bool>,
) -> Result<DockerCommandResult, String> {
    let mut args = vec!["rm"];
    if force.unwrap_or(false) {
        args.push("-f");
    }
    args.push(container.as_str());
    Ok(run_docker(&args, None))
}

#[tauri::command]
pub async fn docker_push_image(image: String) -> Result<DockerCommandResult, String> {
    Ok(run_docker(&["push", image.as_str()], None))
}

#[tauri::command]
pub async fn docker_generate_dockerfile_ai(
    input: DockerAiGenerateInput,
) -> Result<DockerAiGenerateOutput, String> {
    let root = project_root(&input.project_path)?;
    let providers = crate::commands::settings::get_ai_providers().await?;
    let provider = if let Some(provider_id) = input
        .provider_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        providers
            .iter()
            .find(|p| p.id == provider_id)
            .ok_or_else(|| format!("未找到 AI 供应商: {}", provider_id))?
    } else {
        providers
            .iter()
            .find(|p| p.enabled && p.is_default_provider)
            .or_else(|| providers.iter().find(|p| p.enabled))
            .ok_or_else(|| "未配置可用的 AI 供应商".to_string())?
    };
    let model = if let Some(model_id) = input.model_id.as_deref().filter(|s| !s.trim().is_empty()) {
        provider
            .models
            .iter()
            .find(|m| m.id == model_id)
            .ok_or_else(|| format!("未找到 AI 模型: {}", model_id))?
    } else {
        provider
            .models
            .iter()
            .find(|m| m.enabled && m.is_default)
            .or_else(|| provider.models.iter().find(|m| m.enabled))
            .ok_or_else(|| "当前 AI 供应商没有启用的模型".to_string())?
    };

    let dockerfile_path = input
        .dockerfile_path
        .unwrap_or_else(|| "Dockerfile".to_string());
    let existing = resolve_existing_project_file(&root, &dockerfile_path)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .unwrap_or_default();
    let prompt = format!(
        "你是资深 DevOps 工程师。请根据项目上下文生成一个生产可用 Dockerfile。\n\
         只返回 Dockerfile 内容，不要解释，不要 Markdown。\n\n\
         项目目录: {}\n\
         目标 Dockerfile: {}\n\
         目标镜像名: {}\n\n\
         现有 Dockerfile:\n{}\n\n\
         {}\n\n\
         要求:\n\
         1. 如果适合，使用多阶段构建。\n\
         2. 只复制必要文件，优先利用依赖缓存。\n\
         3. 使用合理的基础镜像和生产启动命令。\n\
         4. 暴露项目最可能使用的端口。\n\
         5. 不要包含解释文字。",
        root.display(),
        dockerfile_path,
        input.image_name.unwrap_or_else(|| "<未设置>".into()),
        if existing.trim().is_empty() {
            "<无>"
        } else {
            existing.as_str()
        },
        read_project_context(&root)
    );

    let url = format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(&url).json(&json!({
        "model": model.model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": false
    }));
    if let Some(key) = provider.api_key.as_ref() {
        if !key.trim().is_empty() {
            req = req.bearer_auth(key);
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("AI 请求失败: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("AI {}: {}", status, text));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("AI 响应解析失败: {}", e))?;
    let content = body
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if content.is_empty() {
        return Err("AI 未返回 Dockerfile 内容".into());
    }

    Ok(DockerAiGenerateOutput {
        content: extract_dockerfile_content(content),
        provider_name: provider.name.clone(),
        model_name: model.model.clone(),
    })
}
