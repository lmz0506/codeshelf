// 简历 docx 导出。
//
// 把前端 ResumeV2 (作为 serde_json::Value 传过来) 渲染成 HR 标准格式的 .docx:
//   - 顶部个人信息、个人简介、核心技能、工作经历、项目经历、教育背景
//   - 项目经历按固定格式渲染:项目时间 / 项目角色 / 技术栈 / 项目描述 / 核心职责 / 项目成果
//
// STAR 兼容字段转换跟前端 src/services/resume/preview.ts 的算法保持一致:
//   - 项目描述 = situation
//   - 核心职责 = action 按句拆 bullet
//   - 项目成果 = result 按句拆 bullet
//
// 用 docx-rs 直接写文件,不依赖外部模板。中文字体走 "Microsoft YaHei",在 Windows /
// macOS / Linux+Office 上都能显示。

use std::fs;
use std::path::PathBuf;

use docx_rs::{
    AbstractNumbering, AlignmentType, Docx, IndentLevel, Level, LevelJc, LevelText, NumberFormat,
    Numbering, NumberingId, Paragraph, Run, RunFonts, SpecialIndentType, Start, Table, TableCell,
    TableRow, WidthType,
};
use serde::Deserialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};

const CN_FONT: &str = "Microsoft YaHei";
const NUM_ID: usize = 1;

#[tauri::command]
#[specta::specta]
pub async fn export_resume_docx(resume: Value, file_path: String) -> AppResult<String> {
    let payload: ResumePayload = serde_json::from_value(resume)
        .map_err(|e| AppError::from(format!("简历数据格式错误: {}", e)))?;

    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::from(format!("创建目录失败: {}", e)))?;
        }
    }

    let docx = build_docx(&payload);
    let file = fs::File::create(&path)
        .map_err(|e| AppError::from(format!("创建文件失败: {}", e)))?;
    docx.build()
        .pack(file)
        .map_err(|e| AppError::from(format!("生成 docx 失败: {}", e)))?;

    Ok(file_path)
}

// =================== Payload ===================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResumePayload {
    #[serde(default)]
    job_direction: String,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    skills: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    jd_keywords: Vec<String>,
    #[serde(default)]
    experiences: Vec<ExperiencePayload>,
    #[serde(default)]
    personal_info: Option<PersonalInfoPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExperiencePayload {
    #[serde(default)]
    project_name: String,
    #[serde(default)]
    project_time: Option<String>,
    #[serde(default)]
    project_role: Option<String>,
    #[serde(default)]
    tech_stack: Vec<String>,
    #[serde(default)]
    star_experience: StarPayload,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StarPayload {
    #[serde(default)]
    situation: String,
    #[serde(default)]
    action: String,
    #[serde(default)]
    result: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonalInfoPayload {
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    basic: BasicInfo,
    #[serde(default)]
    educations: Vec<EducationInfo>,
    #[serde(default)]
    job_preference: JobPreferenceInfo,
    #[serde(default)]
    social: SocialInfo,
    #[serde(default)]
    custom_fields: Vec<CustomFieldPayload>,
    #[serde(default)]
    work_experiences: Vec<WorkExperiencePayload>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicInfo {
    #[serde(default)]
    #[allow(dead_code)]
    avatar_url: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    phone: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    work_experience: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EducationInfo {
    #[serde(default)]
    degree: Option<String>,
    #[serde(default)]
    school: Option<String>,
    #[serde(default)]
    start_date: Option<String>,
    #[serde(default)]
    end_date: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobPreferenceInfo {
    #[serde(default)]
    expected_position: Option<String>,
    #[serde(default)]
    expected_salary: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SocialInfo {
    #[serde(default)]
    websites: Vec<WebsitePayload>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebsitePayload {
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomFieldPayload {
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    value: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkExperiencePayload {
    #[serde(default)]
    company: Option<String>,
    #[serde(default)]
    position: Option<String>,
    #[serde(default)]
    start_date: Option<String>,
    #[serde(default)]
    end_date: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

fn val(opt: &Option<String>) -> &str {
    opt.as_deref().unwrap_or("")
}

// =================== STAR 兼容字段 → 投递版格式 ===================

fn split_bullets(text: &str) -> Vec<String> {
    let t = text.trim();
    if t.is_empty() {
        return Vec::new();
    }
    let markdown_items: Vec<String> = t
        .lines()
        .map(str::trim)
        .filter_map(strip_list_marker)
        .filter(|s| !s.is_empty())
        .collect();
    if markdown_items.len() >= 2 {
        return markdown_items;
    }
    let mut parts: Vec<String> = split_by_chars(t, &['。', '！', '？', '；', ';', '!', '?'])
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.len() == 1 && parts[0].chars().count() > 60 {
        let sub: Vec<String> = split_by_chars(&parts[0], &[',', ','])
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if sub.len() >= 2 {
            parts = sub;
        }
    }
    parts
        .into_iter()
        .map(|s| {
            s.trim_end_matches(|c: char| {
                matches!(c, '。' | '！' | '？' | '；' | ';' | '!' | '?')
            })
            .trim()
            .to_string()
        })
        .filter(|s| !s.is_empty())
        .collect()
}

fn strip_list_marker(line: &str) -> Option<String> {
    let trimmed = line.trim();
    for marker in ["- ", "* ", "• "] {
        if let Some(rest) = trimmed.strip_prefix(marker) {
            return Some(rest.trim().to_string());
        }
    }
    let mut chars = trimmed.char_indices().peekable();
    let mut end = 0;
    while let Some((idx, c)) = chars.peek().copied() {
        if c.is_ascii_digit() {
            end = idx + c.len_utf8();
            chars.next();
        } else {
            break;
        }
    }
    if end > 0 {
        let rest = &trimmed[end..];
        for marker in [". ", ") ", "、"] {
            if let Some(value) = rest.strip_prefix(marker) {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

/// 中文标点切分,需要保留切分符之前的内容。简化做法:对每个字符判断,
/// 遇到分隔符就把缓冲区刷成一段。
fn split_by_chars(text: &str, separators: &[char]) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for c in text.chars() {
        if separators.contains(&c) {
            buf.push(c);
            if !buf.trim().is_empty() {
                out.push(std::mem::take(&mut buf));
            }
        } else {
            buf.push(c);
        }
    }
    if !buf.trim().is_empty() {
        out.push(buf);
    }
    out
}

fn job_direction_title(d: &str) -> String {
    match d {
        "backend" => "后端开发工程师".into(),
        "frontend" => "前端开发工程师".into(),
        "fullstack" => "全栈开发工程师".into(),
        other => format!("{} 工程师", other),
    }
}

// =================== docx 渲染辅助 ===================

fn cn_run(text: &str) -> Run {
    Run::new()
        .add_text(text)
        .fonts(RunFonts::new().east_asia(CN_FONT).ascii(CN_FONT))
}

fn cn_run_with(text: &str, bold: bool, size_half_points: usize) -> Run {
    let mut run = cn_run(text).size(size_half_points);
    if bold {
        run = run.bold();
    }
    run
}

/// h1 = 简历主标题。
fn h1(text: &str) -> Paragraph {
    Paragraph::new()
        .add_run(cn_run_with(text, true, 36))
        .align(AlignmentType::Center)
}

/// h2 = 章节标题 (个人信息 / 个人简介 / ...)
fn h2(text: &str) -> Paragraph {
    Paragraph::new().add_run(cn_run_with(text, true, 28))
}

/// h3 = 子节标题 (教育背景 / 求职偏好 / 项目1 ...)
fn h3(text: &str) -> Paragraph {
    Paragraph::new().add_run(cn_run_with(text, true, 24))
}

/// 普通段落,12pt = 24 half-points
fn body_text(text: &str) -> Paragraph {
    Paragraph::new().add_run(cn_run_with(text, false, 24))
}

/// 加粗 label + 正常 value 在同一行 (例如 "技术栈: a, b, c")
fn label_value(label: &str, value: &str) -> Paragraph {
    Paragraph::new()
        .add_run(cn_run_with(&format!("{}: ", label), true, 24))
        .add_run(cn_run_with(value, false, 24))
}

/// 编号列表项 (核心职责 / 项目成果)
fn numbered_item(text: &str) -> Paragraph {
    Paragraph::new()
        .numbering(NumberingId::new(NUM_ID), IndentLevel::new(0))
        .add_run(cn_run_with(text, false, 24))
}

fn spacer() -> Paragraph {
    Paragraph::new().add_run(Run::new())
}

// =================== 个人信息 table ===================

fn info_cell(label: &str, value: &str) -> TableCell {
    let label_para = Paragraph::new().add_run(cn_run_with(label, true, 20));
    let value_para = Paragraph::new().add_run(cn_run_with(value, false, 22));
    TableCell::new().add_paragraph(label_para).add_paragraph(value_para)
}

/// 顶部个人信息走 2 列表格,标签 + 值竖排在同一格。
fn render_basic_info_table(
    basic: &BasicInfo,
    job: &JobPreferenceInfo,
    social: &SocialInfo,
    custom_fields: &[CustomFieldPayload],
) -> Table {
    let website = websites_text(social);
    let mut cells: Vec<(&str, String)> = vec![
        ("姓名", val(&basic.name)),
        ("手机", val(&basic.phone)),
        ("邮箱", val(&basic.email)),
        ("工作经验", val(&basic.work_experience)),
        ("求职岗位", val(&job.expected_position)),
        ("期望薪资", val(&job.expected_salary)),
        ("网站", website.as_str()),
    ]
    .into_iter()
    .filter(|(_, value)| !value.trim().is_empty())
    .map(|(label, value)| (label, value.to_string()))
    .collect();
    for field in custom_fields {
        let label = val(&field.label).trim();
        let value = val(&field.value).trim();
        if !label.is_empty() || !value.is_empty() {
            cells.push((if label.is_empty() { "自定义" } else { label }, value.to_string()));
        }
    }
    let cells = if cells.is_empty() {
        vec![("个人信息", "未填写".to_string())]
    } else {
        cells
    };
    let rows: Vec<TableRow> = cells
        .chunks(2)
        .map(|pair| {
            let left = info_cell(pair[0].0, &pair[0].1);
            let right = pair
                .get(1)
                .map(|item| info_cell(item.0, &item.1))
                .unwrap_or_else(|| info_cell("", ""));
            TableRow::new(vec![left, right])
        })
        .collect();
    Table::new(rows).width(9000, WidthType::Dxa)
}

fn websites_text(social: &SocialInfo) -> String {
    social
        .websites
        .iter()
        .filter_map(|item| {
            let url = item.url.as_deref().map(str::trim).filter(|s| !s.is_empty())?;
            let label = item.label.as_deref().map(str::trim).filter(|s| !s.is_empty());
            Some(label.map(|l| format!("{}: {}", l, url)).unwrap_or_else(|| url.to_string()))
        })
        .collect::<Vec<_>>()
        .join("；")
}

// =================== 整体组装 ===================

fn build_docx(p: &ResumePayload) -> Docx {
    let mut docx = Docx::new();

    // 项目符号 numbering 定义 (NUM_ID = 1)
    docx = docx.add_abstract_numbering(
        AbstractNumbering::new(NUM_ID).add_level(
            Level::new(
                0,
                Start::new(1),
                NumberFormat::new("bullet"),
                LevelText::new("•"),
                LevelJc::new("left"),
            )
            .indent(Some(420), Some(SpecialIndentType::Hanging(240)), None, None),
        ),
    );
    docx = docx.add_numbering(Numbering::new(NUM_ID, NUM_ID));

    // 标题
    docx = docx.add_paragraph(h1(&format!("{}简历", job_direction_title(&p.job_direction))));
    docx = docx.add_paragraph(spacer());

    // ---- 顶部个人信息 ----
    docx = docx.add_paragraph(h2("个人信息"));
    let pi_default = PersonalInfoPayload::default();
    let pi = p.personal_info.as_ref().unwrap_or(&pi_default);
    docx = docx.add_table(render_basic_info_table(
        &pi.basic,
        &pi.job_preference,
        &pi.social,
        &pi.custom_fields,
    ));
    docx = docx.add_paragraph(spacer());

    // ---- 个人简介 ----
    let summary = val(&pi.summary);
    let summary = if summary.trim().is_empty() {
        p.summary.as_deref().unwrap_or("").trim()
    } else {
        summary.trim()
    };
    if !summary.is_empty() {
        docx = docx.add_paragraph(h2("个人简介"));
        docx = docx.add_paragraph(body_text(summary));
        docx = docx.add_paragraph(spacer());
    }

    // ---- 核心技能 ----
    if !p.skills.is_empty() {
        docx = docx.add_paragraph(h2("核心技能"));
        docx = docx.add_paragraph(body_text(&p.skills.join(" · ")));
        docx = docx.add_paragraph(spacer());
    }

    // ---- 工作经历 ----
    if !pi.work_experiences.is_empty() {
        docx = docx.add_paragraph(h2("工作经历"));
        for item in &pi.work_experiences {
            let title = [val(&item.company), val(&item.position)]
                .into_iter()
                .filter(|s| !s.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" · ");
            docx = docx.add_paragraph(h3(if title.trim().is_empty() { "工作经历" } else { &title }));
            let time = [val(&item.start_date), val(&item.end_date)]
                .into_iter()
                .filter(|s| !s.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" - ");
            if !time.trim().is_empty() {
                docx = docx.add_paragraph(label_value("时间", &time));
            }
            for bullet in split_bullets(val(&item.description)) {
                docx = docx.add_paragraph(numbered_item(&bullet));
            }
        }
        docx = docx.add_paragraph(spacer());
    }

    // ---- 项目经历 ----
    if !p.experiences.is_empty() {
        docx = docx.add_paragraph(h2("项目经历"));
        for (idx, exp) in p.experiences.iter().enumerate() {
            docx = docx.add_paragraph(h3(&format!("{}. {}", idx + 1, exp.project_name)));
            if let Some(project_time) = exp.project_time.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                docx = docx.add_paragraph(label_value("项目时间", project_time));
            }
            if let Some(project_role) = exp.project_role.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                docx = docx.add_paragraph(label_value("项目角色", project_role));
            }
            if !exp.tech_stack.is_empty() {
                docx = docx.add_paragraph(label_value("技术栈", &exp.tech_stack.join(", ")));
            }
            let star = &exp.star_experience;
            let description = star.situation.trim();
            let responsibilities = split_bullets(&star.action);
            let achievements = split_bullets(&star.result);

            if !description.is_empty() {
                docx = docx.add_paragraph(label_value_block("项目描述"));
                docx = docx.add_paragraph(body_text(description));
            }
            if !responsibilities.is_empty() {
                docx = docx.add_paragraph(label_value_block("核心职责"));
                for item in &responsibilities {
                    docx = docx.add_paragraph(numbered_item(item));
                }
            }
            if !achievements.is_empty() {
                docx = docx.add_paragraph(label_value_block("项目成果"));
                for item in &achievements {
                    docx = docx.add_paragraph(numbered_item(item));
                }
            }
            // 项目之间留分页/空行
            if idx + 1 < p.experiences.len() {
                docx = docx.add_paragraph(spacer());
            }
        }
    }

    // ---- 教育背景 ----
    let educations: Vec<&EducationInfo> = pi
        .educations
        .iter()
        .filter(|item| {
            !val(&item.school).trim().is_empty()
                || !val(&item.degree).trim().is_empty()
                || !val(&item.start_date).trim().is_empty()
                || !val(&item.end_date).trim().is_empty()
        })
        .collect();
    if !educations.is_empty() {
        docx = docx.add_paragraph(h2("教育背景"));
        for item in educations {
            let edu_title = [val(&item.school), val(&item.degree)]
                .into_iter()
                .filter(|s| !s.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" · ");
            if !edu_title.trim().is_empty() {
                docx = docx.add_paragraph(h3(&edu_title));
            }
            let edu_time = [val(&item.start_date), val(&item.end_date)]
                .into_iter()
                .filter(|s| !s.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" - ");
            if !edu_time.trim().is_empty() {
                docx = docx.add_paragraph(label_value("时间", &edu_time));
            }
        }
    }

    docx
}

/// 段落级的「加粗小标题」(项目描述 / 核心职责 / 项目成果),独占一行。
fn label_value_block(label: &str) -> Paragraph {
    Paragraph::new().add_run(cn_run_with(label, true, 22))
}
