// ResumeProjectExperience → HR 友好的项目经历结构转换。
//
// 目标格式:
//   项目名称 / 项目时间 / 项目角色 / 技术栈 / 项目描述 / 核心职责 / 项目成果
// 其中“技术亮点”不单独展示,而是融合进核心职责的每个 bullet。
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
  projectTime?: string;
  projectRole?: string;
  techStack: string[];
  description: string;
  responsibilitiesMarkdown: string;
  achievementsMarkdown: string;
  /** 核心职责:职责 + 项目亮点融合后的要点列表 */
  responsibilities: string[];
  /** 项目成果 */
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
  const lines = t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const markdownLines = lines.filter((line) => /^([-*•]|\d+[.)、])\s+/.test(line));
  if (markdownLines.length >= 2) {
    return markdownLines
      .map((s) => s.replace(/^[-*•]\s+/u, "").replace(/^\d+[.)、]\s*/u, "").trim())
      .filter(Boolean);
  }
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

export function formatExperience(
  exp: ResumeProjectExperience,
): FormattedExperience {
  const star = exp.starExperience;
  const description = (star.situation ?? "").trim();
  const responsibilitiesMarkdown = (star.action ?? "").trim();
  const achievementsMarkdown = (star.result ?? "").trim();
  const responsibilities = splitToBullets(responsibilitiesMarkdown);
  const achievements = splitToBullets(achievementsMarkdown);
  return {
    projectName: exp.projectName,
    projectTime: exp.projectTime?.trim() || undefined,
    projectRole: exp.projectRole?.trim() || star.task?.trim() || undefined,
    techStack: exp.techStack,
    description,
    responsibilitiesMarkdown,
    achievementsMarkdown,
    responsibilities,
    achievements,
    hasContent: !!(description || responsibilities.length || achievements.length),
  };
}

export function formatResume(resume: ResumeV2): FormattedResume {
  return {
    title: jobDirectionTitle(resume.jobDirection),
    generatedAt: resume.createdAt,
    summary: (resume.personalInfo?.summary ?? resume.summary ?? "").trim(),
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
  { key: "phone", label: "手机" },
  { key: "email", label: "邮箱" },
  { key: "workExperience", label: "工作经验" },
];

export const PERSONAL_INFO_EDUCATION_FIELDS: PersonalInfoFieldDef<
  keyof PersonalInfo["educations"][number]
>[] = [
  { key: "school", label: "学校" },
  { key: "degree", label: "学历" },
  { key: "startDate", label: "开始时间" },
  { key: "endDate", label: "结束时间" },
];

export const PERSONAL_INFO_JOB_FIELDS: PersonalInfoFieldDef<
  keyof PersonalInfo["jobPreference"]
>[] = [
  { key: "expectedPosition", label: "期望职位" },
  { key: "expectedSalary", label: "期望薪资" },
];

export const PERSONAL_INFO_SOCIAL_FIELDS: PersonalInfoFieldDef<
  keyof PersonalInfo["social"]
>[] = [
  { key: "websites", label: "网站链接" },
];
