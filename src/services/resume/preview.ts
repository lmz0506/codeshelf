// STAR 文本 → HR 友好的三段式 (项目背景 / 主要职责 / 项目成果) 转换。
//
// 目的:Agent 产出的 STAR 字段含「S/T/A/R」专业术语,HR 阅读不友好。预览 + docx
// 导出走这个 formatter,把 4 段重新组合成:
//   - 项目背景:S + T 合并成一段连贯描述
//   - 主要职责:A 按句号拆成 bullet 列表
//   - 项目成果:R 按句号拆成 bullet 列表
//
// 不动 LLM,纯文本处理。原 starExperience 数据保持原样,只在 render 时转换。

import type {
  PersonalInfo,
  ResumeProjectExperience,
  ResumeV2,
} from "@/types/resume";

const DIRECTION_TITLE: Record<string, string> = {
  backend: "后端开发工程师",
  frontend: "前端开发工程师",
  fullstack: "全栈开发工程师",
};

export interface FormattedExperience {
  projectName: string;
  techStack: string[];
  background: string;
  /** 主要职责 (A) 按句拆分后的要点列表 */
  responsibilities: string[];
  /** 项目成果 (R) 按句拆分后的要点列表 */
  achievements: string[];
  /** 是否实际有可显示内容 */
  hasContent: boolean;
}

export interface FormattedResume {
  title: string;
  generatedAt: string;
  summary: string;
  skills: string[];
  jdKeywords: string[];
  experiences: FormattedExperience[];
}

export function jobDirectionTitle(direction: string): string {
  return DIRECTION_TITLE[direction] ?? `${direction} 工程师`;
}

/// 把一段中文长文本按 「。!?；;」拆成短句列表,过滤掉空项。
/// 若拆出来只剩 1 段且较长,会再按 「,」尝试细分;否则维持单段。
function splitToBullets(text: string): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  // 首选标点
  let parts = t
    .split(/(?<=[。!?；;！？])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // 若拆完仍是单段且 > 60 字,尝试按逗号细分
  if (parts.length === 1 && parts[0].length > 60) {
    const sub = parts[0]
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sub.length >= 2) parts = sub;
  }
  // 去重尾标点(列表项里末尾的「。」可去掉,看起来更干净)
  return parts.map((s) => s.replace(/[。!?；;！？]$/u, "").trim()).filter(Boolean);
}

/// 拼 S + T 为一段「项目背景」描述。
/// 优先逻辑:两段都有 → 拼接;只 S → S;只 T → T;都无 → 空串。
function mergeBackground(situation: string, task: string): string {
  const s = (situation ?? "").trim();
  const t = (task ?? "").trim();
  if (s && t) {
    // 避免重复:若 task 已经完整出现在 situation,就只用 situation
    if (s.includes(t)) return s;
    if (t.includes(s)) return t;
    return `${s}${s.endsWith("。") || s.endsWith(".") ? "" : "。"}${t}`;
  }
  return s || t;
}

export function formatExperience(
  exp: ResumeProjectExperience,
): FormattedExperience {
  const star = exp.starExperience;
  const background = mergeBackground(star.situation, star.task);
  const responsibilities = splitToBullets(star.action);
  const achievements = splitToBullets(star.result);
  return {
    projectName: exp.projectName,
    techStack: exp.techStack,
    background,
    responsibilities,
    achievements,
    hasContent: !!(background || responsibilities.length || achievements.length),
  };
}

export function formatResume(resume: ResumeV2): FormattedResume {
  return {
    title: jobDirectionTitle(resume.jobDirection),
    generatedAt: resume.createdAt,
    summary: (resume.summary ?? "").trim(),
    skills: resume.skills,
    jdKeywords: resume.jdKeywords,
    experiences: resume.experiences.map(formatExperience),
  };
}

// =============== 个人信息「显示标签」与「字段顺序」配置 ===============
//
// 单独抽出来,Preview 组件、docx 后端可以共享一致的字段顺序与中文标签。

export interface PersonalInfoFieldDef<K extends string = string> {
  key: K;
  label: string;
  placeholder?: string;
}

export const PERSONAL_INFO_BASIC_FIELDS: PersonalInfoFieldDef<
  keyof PersonalInfo["basic"]
>[] = [
  { key: "name", label: "姓名" },
  { key: "gender", label: "性别" },
  { key: "birthDate", label: "出生年月" },
  { key: "phone", label: "手机" },
  { key: "email", label: "邮箱" },
  { key: "location", label: "现居地" },
  { key: "jobStatus", label: "求职状态" },
];

export const PERSONAL_INFO_EDUCATION_FIELDS: PersonalInfoFieldDef<
  keyof PersonalInfo["education"]
>[] = [
  { key: "degree", label: "最高学历" },
  { key: "school", label: "毕业院校" },
  { key: "major", label: "专业" },
  { key: "graduationYear", label: "毕业年份" },
];

export const PERSONAL_INFO_JOB_FIELDS: PersonalInfoFieldDef<
  keyof PersonalInfo["jobPreference"]
>[] = [
  { key: "yearsOfExperience", label: "工作年限" },
  { key: "expectedPosition", label: "期望职位" },
  { key: "expectedSalary", label: "期望薪资" },
  { key: "expectedCity", label: "期望城市" },
];

export const PERSONAL_INFO_SOCIAL_FIELDS: PersonalInfoFieldDef<
  keyof PersonalInfo["social"]
>[] = [
  { key: "website", label: "个人网站" },
  { key: "github", label: "GitHub" },
  { key: "blog", label: "博客" },
  { key: "linkedin", label: "领英" },
  { key: "wechat", label: "微信" },
];
