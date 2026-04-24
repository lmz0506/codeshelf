use super::ai::generate_dockerfile_with_ai;
use super::templates::generate_template;
use super::types::{
    DockerAiGenerateInput, DockerAiGenerateOutput, DockerBuildInput, DockerCommandResult,
    DockerContainerInfo, DockerImageInfo, DockerRunInput, DockerStatus,
};
use super::utils::{
    current_platform, project_root, resolve_existing_project_file, resolve_project_file, run_docker,
    walk_dockerfiles,
};
use serde_json::Value;
use std::fs;

#[tauri::command]
pub async fn docker_check_available() -> Result<DockerStatus, String> {
    let result = run_docker(&["--version"], None);
    if result.success {
        Ok(DockerStatus {
            available: true,
            version: Some(format!("{} ({})", result.stdout.trim(), current_platform())),
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
    Ok(generate_template(&root, template.as_deref()))
}

#[tauri::command]
pub async fn docker_generate_dockerfile_ai(
    input: DockerAiGenerateInput,
) -> Result<DockerAiGenerateOutput, String> {
    generate_dockerfile_with_ai(input).await
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
    let volumes = input.volumes.unwrap_or_default();
    for volume in &volumes {
        if !volume.trim().is_empty() {
            args.push("-v");
            args.push(volume);
        }
    }
    if let Some(network) = input.network.as_deref().filter(|s| !s.trim().is_empty()) {
        args.push("--network");
        args.push(network);
    }
    if let Some(restart) = input.restart.as_deref().filter(|s| !s.trim().is_empty()) {
        args.push("--restart");
        args.push(restart);
    }
    if let Some(user) = input.user.as_deref().filter(|s| !s.trim().is_empty()) {
        args.push("-u");
        args.push(user);
    }
    if let Some(workdir) = input.workdir.as_deref().filter(|s| !s.trim().is_empty()) {
        args.push("-w");
        args.push(workdir);
    }
    if input.privileged.unwrap_or(false) {
        args.push("--privileged");
    }
    if input.read_only.unwrap_or(false) {
        args.push("--read-only");
    }
    let extra_args = input.extra_args.unwrap_or_default();
    for item in &extra_args {
        if !item.trim().is_empty() {
            args.push(item);
        }
    }
    args.push(input.image.as_str());
    let command_parts = input
        .command
        .as_deref()
        .unwrap_or("")
        .split_whitespace()
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>();
    for part in command_parts {
        args.push(part);
    }
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

fn json_to_yaml(value: &Value, indent: usize) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(v) => v.to_string(),
        Value::Number(v) => v.to_string(),
        Value::String(v) => {
            if v.is_empty()
                || v.contains(':')
                || v.contains('#')
                || v.contains('\n')
                || v.contains('"')
                || v.contains('\'')
            {
                format!("{:?}", v)
            } else {
                v.to_string()
            }
        }
        Value::Array(items) => {
            if items.is_empty() {
                return "[]".to_string();
            }
            items
                .iter()
                .map(|item| {
                    let rendered = json_to_yaml(item, indent + 2);
                    if rendered.contains('\n') {
                        format!("{}- {}", " ".repeat(indent), rendered.trim_start())
                    } else {
                        format!("{}- {}", " ".repeat(indent), rendered)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
        Value::Object(map) => {
            if map.is_empty() {
                return "{}".to_string();
            }
            map.iter()
                .map(|(key, item)| {
                    let rendered = json_to_yaml(item, indent + 2);
                    if matches!(item, Value::Array(_) | Value::Object(_)) && rendered != "[]" && rendered != "{}" {
                        format!("{}{}:\n{}", " ".repeat(indent), key, rendered)
                    } else {
                        format!("{}{}: {}", " ".repeat(indent), key, rendered)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
    }
}

#[tauri::command]
pub async fn docker_inspect_container_yaml(container: String) -> Result<String, String> {
    let result = run_docker(&["inspect", container.as_str()], None);
    if !result.success {
        return Err(result.stderr);
    }
    let value: Value = serde_json::from_str(&result.stdout)
        .map_err(|e| format!("解析 docker inspect 失败: {}", e))?;
    let first = value
        .as_array()
        .and_then(|items| items.first())
        .unwrap_or(&value);
    Ok(json_to_yaml(first, 0))
}
