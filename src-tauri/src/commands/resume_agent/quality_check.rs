// 背景知识 markdown 的轻量质检。纯函数,无 IO,无 agent 状态。
//
// 规则锚定 knowledge_agent.rs:172 prompt 中要求的 5 个固定章节。
// 任何规则变动,记得同步更新 prompt 或这里。

use crate::commands::resume::QualityIssue;

/// 必须出现的章节标题(H2 级别,不含 `## ` 前缀)。
/// 取自 knowledge_agent.rs 第二轮 prompt 的固定章节列表。
const REQUIRED_SECTIONS: &[&str] = &[
    "项目概览",
    "技术栈详情",
    "核心功能模块",
    "架构亮点",
    "可挂载 JD 关键词",
];

const EMPTY_SECTION_MIN_CHARS: usize = 40;
const LOW_CONFIDENCE_RATIO: f32 = 0.5;
const LOW_CONFIDENCE_MARKER: &str = "未从当前项目文件确认";
const PLACEHOLDER_PROJECT_NAME: &str = "{项目名}";

/// 检查背景知识 markdown,返回质检问题列表(可能为空)。
///
/// 当前规则集:
/// - `missing_section` (error) —— 缺失任一固定章节(H2)或缺失 H1 项目标题
/// - `empty_section`   (warn)  —— H2 章节正文 < EMPTY_SECTION_MIN_CHARS
/// - `placeholder_left`(error) —— 模型未替换 `{项目名}` 占位符
/// - `low_confidence`  (warn)  —— 含 `未从当前项目文件确认` 的行占比超 LOW_CONFIDENCE_RATIO
pub fn check_knowledge_markdown(md: &str) -> Vec<QualityIssue> {
    let mut issues: Vec<QualityIssue> = Vec::new();
    let lines: Vec<&str> = md.lines().collect();

    // H1 是否存在
    let has_h1 = lines.iter().any(|l| l.trim_start().starts_with("# "));
    if !has_h1 {
        issues.push(QualityIssue {
            severity: "error".into(),
            code: "missing_section".into(),
            message: "缺少 H1 项目标题".into(),
            section: Some("项目标题".into()),
        });
    }

    // 解析所有 H2 -> 收集 (title, body_chars)
    let sections = parse_h2_sections(&lines);
    let section_titles: std::collections::HashSet<&str> =
        sections.iter().map(|(t, _)| t.as_str()).collect();

    for required in REQUIRED_SECTIONS {
        if !section_titles.contains(required) {
            issues.push(QualityIssue {
                severity: "error".into(),
                code: "missing_section".into(),
                message: format!("缺少章节: ## {}", required),
                section: Some((*required).into()),
            });
        }
    }

    for (title, body) in &sections {
        if REQUIRED_SECTIONS.contains(&title.as_str())
            && body.chars().count() < EMPTY_SECTION_MIN_CHARS
        {
            issues.push(QualityIssue {
                severity: "warn".into(),
                code: "empty_section".into(),
                message: format!(
                    "章节 ## {} 内容过短(<{} 字符)",
                    title, EMPTY_SECTION_MIN_CHARS
                ),
                section: Some(title.clone()),
            });
        }
    }

    // {项目名} 占位符未替换
    if md.contains(PLACEHOLDER_PROJECT_NAME) {
        issues.push(QualityIssue {
            severity: "error".into(),
            code: "placeholder_left".into(),
            message: format!("`{}` 占位符未被替换为真实项目名", PLACEHOLDER_PROJECT_NAME),
            section: Some("项目标题".into()),
        });
    }

    // low_confidence: 含 marker 的行 / 非空行
    let non_empty_lines = lines.iter().filter(|l| !l.trim().is_empty()).count();
    if non_empty_lines > 0 {
        let confidence_misses = lines
            .iter()
            .filter(|l| l.contains(LOW_CONFIDENCE_MARKER))
            .count();
        let ratio = confidence_misses as f32 / non_empty_lines as f32;
        if ratio > LOW_CONFIDENCE_RATIO {
            issues.push(QualityIssue {
                severity: "warn".into(),
                code: "low_confidence".into(),
                message: format!(
                    "「{}」出现 {} 次,占非空行 {:.0}%,内容可信度较低",
                    LOW_CONFIDENCE_MARKER,
                    confidence_misses,
                    ratio * 100.0
                ),
                section: None,
            });
        }
    }

    issues
}

/// 返回 `Vec<(标题文本, 章节正文)>`。标题文本不含 `## ` 前缀;正文是该 H2 到下个 H1/H2 之间的所有原文行拼接(含换行)。
fn parse_h2_sections(lines: &[&str]) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut current_title: Option<String> = None;
    let mut current_body: String = String::new();

    for line in lines {
        let trimmed = line.trim_start();
        let is_h1 = trimmed.starts_with("# ") && !trimmed.starts_with("## ");
        let is_h2 = trimmed.starts_with("## ") && !trimmed.starts_with("### ");
        if is_h1 || is_h2 {
            if let Some(t) = current_title.take() {
                out.push((t, std::mem::take(&mut current_body)));
            }
            if is_h2 {
                let title = trimmed.trim_start_matches("## ").trim().to_string();
                current_title = Some(title);
                current_body.clear();
            }
        } else if current_title.is_some() {
            current_body.push_str(line);
            current_body.push('\n');
        }
    }
    if let Some(t) = current_title.take() {
        out.push((t, current_body));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn well_formed_md() -> String {
        r#"# 我的项目

## 项目概览
这是一个基于 Tauri 的桌面应用,主要用于管理本地项目。功能涵盖项目分类、Git 集成、AI 辅助等。

## 技术栈详情
- 前端: React 18 + TypeScript + Tailwind CSS
- 后端: Rust + Tauri 2 + sqlx
- 构建: Vite

## 核心功能模块
项目管理: src/pages/Project 入口,store 在 src/stores/projectStore.ts。
聊天: src/pages/Chat 含 Markdown 渲染、tool 调用、stream。
AI 辅助: src/services/resume 含 KnowledgeAgent / ResumeAgent。

## 架构亮点
分层清晰: UI(React) ↔ store(Zustand) ↔ IPC(Tauri command) ↔ 存储(SQLite + 文件)。
Agent 流程: index → plan → read → generate, 两轮 LLM 调用之间夹本地文件读取。

## 可挂载 JD 关键词
- 桌面应用开发(Tauri / Rust / Electron 对比)
- React + TypeScript 大型 SPA
- AI Agent 编排 / LLM tool use
"#.to_string()
    }

    #[test]
    fn well_formed_md_has_no_issues() {
        let issues = check_knowledge_markdown(&well_formed_md());
        assert!(
            issues.is_empty(),
            "expected no issues, got: {:?}",
            issues
        );
    }

    #[test]
    fn missing_section_is_error() {
        let mut md = well_formed_md();
        // 删掉「架构亮点」整段
        md = md.replace("## 架构亮点\n分层清晰: UI(React) ↔ store(Zustand) ↔ IPC(Tauri command) ↔ 存储(SQLite + 文件)。\nAgent 流程: index → plan → read → generate, 两轮 LLM 调用之间夹本地文件读取。\n\n", "");
        let issues = check_knowledge_markdown(&md);
        assert!(
            issues
                .iter()
                .any(|i| i.code == "missing_section" && i.section.as_deref() == Some("架构亮点")
                    && i.severity == "error"),
            "got: {:?}",
            issues
        );
    }

    #[test]
    fn missing_h1_is_error() {
        let md = "## 项目概览\n内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容\n\n## 技术栈详情\n内容\n";
        let issues = check_knowledge_markdown(md);
        assert!(issues
            .iter()
            .any(|i| i.code == "missing_section" && i.message.contains("H1")));
    }

    #[test]
    fn empty_section_is_warn() {
        let md = r#"# 项目

## 项目概览
短。

## 技术栈详情
React + Rust + Tauri,这是一个详细且超过 40 个字符的章节内容描述说明详情。

## 核心功能模块
功能 A、B、C 都做了,每个都很长很长很长很长很长很长很长很长很长很长。

## 架构亮点
分层架构清晰,描述了所有的层次和交互方式以及边界划分等等等等等等。

## 可挂载 JD 关键词
React/Rust/Tauri/桌面应用开发/Agent 编排/LLM tool use。
"#;
        let issues = check_knowledge_markdown(md);
        assert!(
            issues
                .iter()
                .any(|i| i.code == "empty_section"
                    && i.section.as_deref() == Some("项目概览")
                    && i.severity == "warn"),
            "got: {:?}",
            issues
        );
    }

    #[test]
    fn placeholder_left_is_error() {
        let mut md = well_formed_md();
        md = md.replace("# 我的项目", "# {项目名}");
        let issues = check_knowledge_markdown(&md);
        assert!(issues
            .iter()
            .any(|i| i.code == "placeholder_left" && i.severity == "error"));
    }

    #[test]
    fn low_confidence_is_warn() {
        // 故意做一份"全部未确认"的文档,触发 low_confidence 警告。
        let md = r#"# 项目 X

## 项目概览
未从当前项目文件确认
未从当前项目文件确认
未从当前项目文件确认

## 技术栈详情
未从当前项目文件确认
未从当前项目文件确认

## 核心功能模块
未从当前项目文件确认
未从当前项目文件确认

## 架构亮点
未从当前项目文件确认

## 可挂载 JD 关键词
未从当前项目文件确认
"#;
        let issues = check_knowledge_markdown(md);
        assert!(
            issues
                .iter()
                .any(|i| i.code == "low_confidence" && i.severity == "warn"),
            "got: {:?}",
            issues
        );
    }

    #[test]
    fn parse_h2_picks_up_titles_and_bodies() {
        let md = r#"# Title

## A
line 1
line 2

## B
single line
"#;
        let lines: Vec<&str> = md.lines().collect();
        let secs = parse_h2_sections(&lines);
        let names: Vec<&str> = secs.iter().map(|(t, _)| t.as_str()).collect();
        assert_eq!(names, vec!["A", "B"]);
        assert!(secs[0].1.contains("line 1"));
        assert!(secs[0].1.contains("line 2"));
        assert!(secs[1].1.contains("single line"));
    }
}
