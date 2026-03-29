import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import type { GeneratedResume, ProjectExperience } from "@/types/resume";

/**
 * 导出简历为 Markdown 格式
 */
export function exportResumeToMarkdown(resume: GeneratedResume): string {
  const directionMap: Record<string, string> = {
    backend: "后端开发工程师",
    frontend: "前端开发工程师",
    fullstack: "全栈开发工程师",
  };

  const lines: string[] = [];

  // 标题
  lines.push(`# ${directionMap[resume.jobDirection]}简历`);
  lines.push("");

  // 生成信息
  lines.push(
    `> 本简历由 AI 根据 Git 提交记录自动生成于 ${formatDateTime(resume.createdAt)}`
  );
  lines.push("");

  // 技能栈
  lines.push("## 技术栈");
  lines.push("");
  lines.push(resume.skills.join(" · "));
  lines.push("");

  // 项目经历
  lines.push("## 项目经历");
  lines.push("");

  resume.experiences.forEach((exp, index) => {
    lines.push(`### ${index + 1}. ${exp.projectName}`);
    lines.push("");

    // 基本信息
    lines.push(`**技术栈**: ${exp.techStack.join(", ")}`);
    lines.push("");
    lines.push(
      `**时间**: ${formatDateRange(exp.timeRange.start, exp.timeRange.end)} | ` +
        `**提交**: ${exp.commitStats.totalCommits} 次 | ` +
        `**代码量**: +${formatNumber(exp.commitStats.totalInsertions)}/-${formatNumber(exp.commitStats.totalDeletions)}`
    );
    lines.push("");

    // STAR 描述
    if (exp.starExperience) {
      if (exp.starExperience.situation) {
        lines.push(`**项目背景**: ${exp.starExperience.situation}`);
        lines.push("");
      }
      if (exp.starExperience.task) {
        lines.push(`**承担任务**: ${exp.starExperience.task}`);
        lines.push("");
      }
      if (exp.starExperience.action) {
        lines.push(`**技术行动**: ${exp.starExperience.action}`);
        lines.push("");
      }
      if (exp.starExperience.result) {
        lines.push(`**项目成果**: ${exp.starExperience.result}`);
        lines.push("");
      }
    }

    // 分隔
    if (index < resume.experiences.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  // 页脚
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "*本简历使用 [CodeShelf](https://github.com/en-o/codeshelf) 简历生成器自动生成*"
  );

  return lines.join("\n");
}

/**
 * 导出简历到文件（让用户选择路径）
 * @returns 用户选择的完整路径
 */
export async function exportResumeToFileWithDialog(
  content: string,
  defaultFilename: string
): Promise<string | null> {
  try {
    // 打开保存对话框
    const filePath = await save({
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
      defaultPath: defaultFilename,
    });

    // 用户取消
    if (!filePath) {
      return null;
    }

    await writeTextFile(filePath, content);
    return filePath;
  } catch (err) {
    throw new Error(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 导出为纯文本格式（适合复制粘贴）
 */
export function exportResumeToText(resume: GeneratedResume): string {
  const directionMap: Record<string, string> = {
    backend: "后端开发工程师",
    frontend: "前端开发工程师",
    fullstack: "全栈开发工程师",
  };

  const lines: string[] = [];

  lines.push(`${directionMap[resume.jobDirection]}简历`);
  lines.push("");
  lines.push("技术栈:");
  lines.push(resume.skills.join("、"));
  lines.push("");
  lines.push("项目经历:");
  lines.push("");

  resume.experiences.forEach((exp, index) => {
    lines.push(`${index + 1}. ${exp.projectName}`);
    lines.push(`   技术栈: ${exp.techStack.join(", ")}`);
    lines.push(
      `   ${formatDateRange(exp.timeRange.start, exp.timeRange.end)} | ` +
        `${exp.commitStats.totalCommits} 次提交`
    );

    if (exp.starExperience) {
      lines.push("");
      if (exp.starExperience.situation) {
        lines.push(`   背景: ${exp.starExperience.situation}`);
      }
      if (exp.starExperience.task) {
        lines.push(`   任务: ${exp.starExperience.task}`);
      }
      if (exp.starExperience.action) {
        lines.push(`   行动: ${exp.starExperience.action}`);
      }
      if (exp.starExperience.result) {
        lines.push(`   成果: ${exp.starExperience.result}`);
      }
    }
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * 导出单个项目经历为 Prompt（用于重新生成）
 */
export function exportExperienceToPrompt(exp: ProjectExperience): string {
  return `请根据以下项目数据，生成符合 STAR 结构的项目经历描述：

项目名称：${exp.projectName}
技术栈：${exp.techStack.join(", ")}
时间：${formatDateRange(exp.timeRange.start, exp.timeRange.end)}
提交统计：${exp.commitStats.totalCommits} 次提交

关键提交：
${exp.commitStats.keyCommits
  .slice(0, 5)
  .map((c) => `- ${c.message}`)
  .join("\n")}

请以 JSON 格式输出 S/T/A/R 四个部分。`;
}

// 辅助函数
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(
    2,
    "0"
  )} - ${endDate.getFullYear()}.${String(endDate.getMonth() + 1).padStart(2, "0")}`;
}

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "w";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return String(num);
}
