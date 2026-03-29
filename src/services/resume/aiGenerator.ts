import { invoke } from "@tauri-apps/api/core";
import type { AiProviderConfig } from "@/types";
import type {
  ResumeDataSource,
  JobDirection,
  GeneratedResume,
  ProjectExperience,
  STARExperience,
  JobDirectionConfig,
} from "@/types/resume";
import { JOB_DIRECTIONS } from "@/types/resume";

interface GenerateOptions {
  dataSource: ResumeDataSource;
  jobDirection: JobDirection;
  provider: AiProviderConfig;
  signal?: AbortSignal;
}

/**
 * 使用 AI 生成简历
 */
export async function generateResumeWithAI({
  dataSource,
  jobDirection,
  provider,
  signal,
}: GenerateOptions): Promise<GeneratedResume> {
  const direction = JOB_DIRECTIONS.find((d) => d.id === jobDirection)!;
  const experiences: ProjectExperience[] = [];

  // 逐个生成项目经历
  for (const project of dataSource.projects) {
    if (signal?.aborted) {
      throw new Error("AbortError");
    }

    try {
      const starExperience = await generateSingleExperience(
        project,
        direction,
        provider
      );

      experiences.push({
        ...project,
        starExperience,
        isEdited: false,
      });
    } catch (err) {
      console.error(`生成项目 ${project.projectName} 经历失败:`, err);
      // 保留原项目数据，但不添加 STAR 经历
      experiences.push({
        ...project,
        isEdited: false,
      });
    }
  }

  // 生成技能总结
  const skills = generateSkillsSummary(dataSource);

  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    jobDirection,
    skills,
    experiences,
    isSaved: false,
  };
}

/**
 * 生成单个项目的 STAR 经历
 */
export async function generateSingleExperience(
  project: ProjectExperience,
  direction: JobDirectionConfig,
  provider: AiProviderConfig
): Promise<STARExperience> {
  // 获取默认模型
  const defaultModel = provider.models.find((m) => m.isDefault && m.enabled) ??
                      provider.models.find((m) => m.enabled);

  if (!defaultModel) {
    throw new Error("没有可用的 AI 模型");
  }

  // 构建技术栈字符串
  const techStack = [
    ...project.techStack,
    ...(project.dependencyAnalysis?.keyLibraries ?? []),
  ].join(", ");

  // 构建关键提交描述
  const keyCommitsDesc = project.commitStats.keyCommits
    .slice(0, 5)
    .map((c) => `- [${c.type}] ${c.message} (+${c.insertions}/-${c.deletions})`)
    .join("\n");

  // 构建 Prompt
  const prompt = `${direction.promptTemplate.replace("{techStack}", techStack)}

【项目数据】
- 项目名称：${project.projectName}
- 项目分类：${project.category.join(", ") || "未分类"}
- 技术栈：${techStack}
- 项目架构：${project.dependencyAnalysis?.architectureHints.join(", ") || "未检测"}
- 时间跨度：${formatDate(project.timeRange.start)} - ${formatDate(project.timeRange.end)}
- 提交统计：${project.commitStats.totalCommits} 次提交，+${project.commitStats.totalInsertions}/-${project.commitStats.totalDeletions} 行代码

【关键提交记录】
${keyCommitsDesc}

【输出格式】
请严格按照以下 JSON 格式输出，不要包含任何其他内容：
{
  "situation": "项目背景描述...",
  "task": "承担的任务描述...",
  "action": "采取的技术行动描述...",
  "result": "量化结果描述..."
}

注意：
1. 必须使用给定的技术栈术语，禁止编造
2. 结果部分尽量使用量化指标（如性能提升X%、效率提高X倍）
3. 如果 commit 信息中没有具体数据，可以合理推测，但要符合后端/前端/全栈开发场景
4. 每个字段控制在 100-200 字之间`;

  // 调用 AI
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const response = await invoke<string>("chat_complete", {
    request: {
      requestId,
      providerId: provider.id,
      model: defaultModel.model,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      thinking: defaultModel.thinking,
      stream: false,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      maxTokens: 2000,
    },
  });

  // 解析 JSON 响应
  try {
    const content = response;
    // 提取 JSON 部分
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("无法解析 AI 响应");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      situation: parsed.situation || "",
      task: parsed.task || "",
      action: parsed.action || "",
      result: parsed.result || "",
    };
  } catch (err) {
    console.error("解析 STAR 经历失败:", err);
    // 返回空结构，让用户手动填写
    return {
      situation: "",
      task: "",
      action: "",
      result: "",
    };
  }
}

/**
 * 生成技能总结
 */
function generateSkillsSummary(dataSource: ResumeDataSource): string[] {
  const techStack = dataSource.overallStats.techStackFrequency;

  // 按频率排序
  const sorted = Object.entries(techStack)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  return sorted.map(([name]) => name);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// 绑定到主函数
generateResumeWithAI.generateSingleExperience = generateSingleExperience;
