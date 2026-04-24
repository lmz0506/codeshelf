use super::types::DockerCommandResult;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

fn docker_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = std::env::var("CODESHELF_DOCKER_BIN") {
        if !path.trim().is_empty() {
            candidates.push(PathBuf::from(path));
        }
    }

    if cfg!(target_os = "windows") {
        candidates.extend([
            PathBuf::from(r"C:\Program Files\Docker\Docker\resources\bin\docker.exe"),
            PathBuf::from(r"C:\ProgramData\DockerDesktop\version-bin\docker.exe"),
        ]);
    } else if cfg!(target_os = "macos") {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/docker"),
            PathBuf::from("/usr/local/bin/docker"),
            PathBuf::from("/Applications/Docker.app/Contents/Resources/bin/docker"),
        ]);
    } else {
        candidates.extend([
            PathBuf::from("/usr/bin/docker"),
            PathBuf::from("/usr/local/bin/docker"),
            PathBuf::from("/snap/bin/docker"),
        ]);
    }

    candidates
}

fn docker_program() -> PathBuf {
    docker_candidates()
        .into_iter()
        .find(|candidate| candidate.exists())
        .unwrap_or_else(|| PathBuf::from(if cfg!(target_os = "windows") { "docker.exe" } else { "docker" }))
}

fn quote_arg(arg: &str) -> String {
    if arg.chars().any(char::is_whitespace) {
        format!("\"{}\"", arg.replace('"', "\\\""))
    } else {
        arg.to_string()
    }
}

pub(super) fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    }
}

pub(super) fn run_docker(args: &[&str], cwd: Option<&Path>) -> DockerCommandResult {
    let program = docker_program();
    let mut command = Command::new(&program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let command_text = format!(
        "{} {}",
        quote_arg(&program.to_string_lossy()),
        args.iter().map(|arg| quote_arg(arg)).collect::<Vec<_>>().join(" ")
    );

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
            stderr: format!(
                "{}。请确认 Docker Desktop 已安装并启动，或设置 CODESHELF_DOCKER_BIN 指向 docker 可执行文件。",
                e
            ),
            command: command_text,
        },
    }
}

pub(super) fn project_root(project_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(project_path).map_err(|e| format!("项目目录无效: {}", e))?;
    if !root.is_dir() {
        return Err("项目路径不是目录".into());
    }
    Ok(root)
}

fn validate_relative_project_path(rel_path: &str) -> Result<PathBuf, String> {
    let rel = rel_path.trim().trim_start_matches(['/', '\\']);
    if rel.is_empty() {
        return Err("文件路径不能为空".into());
    }
    let path = PathBuf::from(rel);
    if path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("只能使用项目内的相对路径".into());
    }
    Ok(path)
}

pub(super) fn resolve_project_file(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let rel = validate_relative_project_path(rel_path)?;
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

pub(super) fn resolve_existing_project_file(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let rel = validate_relative_project_path(rel_path)?;
    let full = root.join(rel);
    let canon = fs::canonicalize(&full).map_err(|e| format!("文件无效: {}", e))?;
    if !canon.starts_with(root) {
        return Err("路径越界".into());
    }
    Ok(canon)
}

pub(super) fn walk_dockerfiles(base: &Path, dir: &Path, out: &mut Vec<String>, depth: u8) {
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

pub(super) fn read_project_context(root: &Path) -> String {
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
        "运行环境: {}\n项目文件（最多 200 项）:\n{}\n\n关键配置文件:\n{}",
        current_platform(),
        files.join("\n"),
        manifests.join("\n\n")
    )
}
