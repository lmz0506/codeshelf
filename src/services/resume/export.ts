import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import type { ResumeV2 } from "@/types/resume";

const DIRECTION_TITLE: Record<string, string> = {
  backend: "后端开发工程师",
  frontend: "前端开发工程师",
  fullstack: "全栈开发工程师",
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// ============== Markdown 导出 ==============

export function exportResumeV2ToMarkdown(resume: ResumeV2): string {
  const lines: string[] = [];
  lines.push(`# ${DIRECTION_TITLE[resume.jobDirection] ?? resume.jobDirection}简历`);
  lines.push("");
  lines.push(
    `> 由 CodeShelf 简历生成器（Deep Agents）于 ${formatDateTime(resume.createdAt)} 生成`
  );
  lines.push("");

  if (resume.summary) {
    lines.push("## 个人简介");
    lines.push("");
    lines.push(resume.summary);
    lines.push("");
  }

  if (resume.skills.length > 0) {
    lines.push("## 技术栈");
    lines.push("");
    lines.push(resume.skills.join(" · "));
    lines.push("");
  }

  if (resume.jdKeywords.length > 0) {
    lines.push("## JD 关键词");
    lines.push("");
    lines.push(resume.jdKeywords.join(" · "));
    lines.push("");
  }

  lines.push("## 项目经历");
  lines.push("");
  resume.experiences.forEach((exp, idx) => {
    lines.push(`### ${idx + 1}. ${exp.projectName}`);
    lines.push("");
    if (exp.techStack.length > 0) {
      lines.push(`**技术栈**: ${exp.techStack.join(", ")}`);
      lines.push("");
    }
    const s = exp.starExperience;
    if (s.situation) {
      lines.push(`**项目背景**: ${s.situation}`);
      lines.push("");
    }
    if (s.task) {
      lines.push(`**承担任务**: ${s.task}`);
      lines.push("");
    }
    if (s.action) {
      lines.push(`**技术行动**: ${s.action}`);
      lines.push("");
    }
    if (s.result) {
      lines.push(`**项目成果**: ${s.result}`);
      lines.push("");
    }
    if (idx < resume.experiences.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  return lines.join("\n");
}

export async function exportResumeV2ToMarkdownWithDialog(
  resume: ResumeV2
): Promise<string | null> {
  const md = exportResumeV2ToMarkdown(resume);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filePath = await save({
    filters: [{ name: "Markdown", extensions: ["md"] }],
    defaultPath: `resume-${timestamp}.md`,
  });
  if (!filePath) return null;
  await writeTextFile(filePath, md);
  return filePath;
}
