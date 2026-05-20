// 简历 docx 导出。
//
// 把前端 ResumeV2 (作为 serde_json::Value 传过来) 渲染成 HR 标准格式的 .docx:
//   - 顶部「个人信息」固定 4 大类:基础 / 教育 / 求职偏好 / 社交链接
//   - 个人简介、技术栈、JD 关键词
//   - 项目经历按三段式 (项目背景 / 主要职责 / 项目成果) 渲染,不出现 STAR 术语
//
// STAR → 三段式转换跟前端 src/services/resume/preview.ts 的算法保持一致:
//   - 项目背景 = situation + task 拼接
//   - 主要职责 = action 按句拆 bullet
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
    task: String,
    #[serde(default)]
    action: String,
    #[serde(default)]
    result: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonalInfoPayload {
    #[serde(default)]
    basic: BasicInfo,
    #[serde(default)]
    education: EducationInfo,
    #[serde(default)]
    job_preference: JobPreferenceInfo,
    #[serde(default)]
    social: SocialInfo,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicInfo {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    gender: Option<String>,
    #[serde(default)]
    birth_date: Option<String>,
    #[serde(default)]
    phone: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    job_status: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EducationInfo {
    #[serde(default)]
    degree: Option<String>,
    #[serde(default)]
    school: Option<String>,
    #[serde(default)]
    major: Option<String>,
    #[serde(default)]
    graduation_year: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobPreferenceInfo {
    #[serde(default)]
    years_of_experience: Option<String>,
    #[serde(default)]
    expected_position: Option<String>,
    #[serde(default)]
    expected_salary: Option<String>,
    #[serde(default)]
    expected_city: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SocialInfo {
    #[serde(default)]
    website: Option<String>,
    #[serde(default)]
    github: Option<String>,
    #[serde(default)]
    blog: Option<String>,
    #[serde(default)]
    linkedin: Option<String>,
    #[serde(default)]
    wechat: Option<String>,
}

fn val(opt: &Option<String>) -> &str {
    opt.as_deref().unwrap_or("")
}

// =================== STAR → 三段式 (跟前端 preview.ts 同算法) ===================

fn merge_background(situation: &str, task: &str) -> String {
    let s = situation.trim();
    let t = task.trim();
    if s.is_empty() {
        return t.to_string();
    }
    if t.is_empty() {
        return s.to_string();
    }
    if s.contains(t) {
        return s.to_string();
    }
    if t.contains(s) {
        return t.to_string();
    }
    let sep = if s.ends_with('。') || s.ends_with('.') {
        ""
    } else {
        "。"
    };
    format!("{}{}{}", s, sep, t)
}

fn split_bullets(text: &str) -> Vec<String> {
    let t = text.trim();
    if t.is_empty() {
        return Vec::new();
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

/// 编号列表项 (主要职责 / 项目成果)
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

/// 基础信息走 2 列 4 行表格,标签 + 值竖排在同一格。
fn render_basic_info_table(basic: &BasicInfo) -> Table {
    let cells = vec![
        ("姓名", val(&basic.name)),
        ("性别", val(&basic.gender)),
        ("出生年月", val(&basic.birth_date)),
        ("手机", val(&basic.phone)),
        ("邮箱", val(&basic.email)),
        ("现居地", val(&basic.location)),
        ("求职状态", val(&basic.job_status)),
        ("", ""),
    ];
    let rows: Vec<TableRow> = cells
        .chunks(2)
        .map(|pair| {
            let left = info_cell(pair[0].0, pair[0].1);
            let right = info_cell(pair[1].0, pair[1].1);
            TableRow::new(vec![left, right])
        })
        .collect();
    Table::new(rows).width(9000, WidthType::Dxa)
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

    // ---- 个人信息 ----
    docx = docx.add_paragraph(h2("个人信息"));
    let pi_default = PersonalInfoPayload::default();
    let pi = p.personal_info.as_ref().unwrap_or(&pi_default);
    docx = docx.add_table(render_basic_info_table(&pi.basic));
    docx = docx.add_paragraph(spacer());

    docx = docx.add_paragraph(h3("教育背景"));
    docx = docx.add_paragraph(label_value("最高学历", val(&pi.education.degree)));
    docx = docx.add_paragraph(label_value("毕业院校", val(&pi.education.school)));
    docx = docx.add_paragraph(label_value("专业", val(&pi.education.major)));
    docx = docx.add_paragraph(label_value("毕业年份", val(&pi.education.graduation_year)));
    docx = docx.add_paragraph(spacer());

    docx = docx.add_paragraph(h3("求职偏好"));
    docx = docx.add_paragraph(label_value(
        "工作年限",
        val(&pi.job_preference.years_of_experience),
    ));
    docx = docx.add_paragraph(label_value(
        "期望职位",
        val(&pi.job_preference.expected_position),
    ));
    docx = docx.add_paragraph(label_value(
        "期望薪资",
        val(&pi.job_preference.expected_salary),
    ));
    docx = docx.add_paragraph(label_value(
        "期望城市",
        val(&pi.job_preference.expected_city),
    ));
    docx = docx.add_paragraph(spacer());

    docx = docx.add_paragraph(h3("社交链接"));
    docx = docx.add_paragraph(label_value("个人网站", val(&pi.social.website)));
    docx = docx.add_paragraph(label_value("GitHub", val(&pi.social.github)));
    docx = docx.add_paragraph(label_value("博客", val(&pi.social.blog)));
    docx = docx.add_paragraph(label_value("领英", val(&pi.social.linkedin)));
    docx = docx.add_paragraph(label_value("微信", val(&pi.social.wechat)));
    docx = docx.add_paragraph(spacer());

    // ---- 个人简介 ----
    if let Some(summary) = p.summary.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        docx = docx.add_paragraph(h2("个人简介"));
        docx = docx.add_paragraph(body_text(summary));
        docx = docx.add_paragraph(spacer());
    }

    // ---- 技术栈 ----
    if !p.skills.is_empty() {
        docx = docx.add_paragraph(h2("技术栈"));
        docx = docx.add_paragraph(body_text(&p.skills.join(" · ")));
        docx = docx.add_paragraph(spacer());
    }

    // ---- 项目经历 ----
    if !p.experiences.is_empty() {
        docx = docx.add_paragraph(h2("项目经历"));
        for (idx, exp) in p.experiences.iter().enumerate() {
            docx = docx.add_paragraph(h3(&format!("{}. {}", idx + 1, exp.project_name)));
            if !exp.tech_stack.is_empty() {
                docx = docx.add_paragraph(label_value("技术栈", &exp.tech_stack.join(", ")));
            }
            let star = &exp.star_experience;
            let background = merge_background(&star.situation, &star.task);
            let responsibilities = split_bullets(&star.action);
            let achievements = split_bullets(&star.result);

            if !background.is_empty() {
                docx = docx.add_paragraph(label_value_block("项目背景"));
                docx = docx.add_paragraph(body_text(&background));
            }
            if !responsibilities.is_empty() {
                docx = docx.add_paragraph(label_value_block("主要职责"));
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

    docx
}

/// 段落级的「加粗小标题」(项目背景 / 主要职责 / 项目成果),独占一行。
fn label_value_block(label: &str) -> Paragraph {
    Paragraph::new().add_run(cn_run_with(label, true, 22))
}
