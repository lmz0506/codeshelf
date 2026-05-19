import { createDeepAgent } from "deepagents";
import { buildChatModel } from "../llmFactory";
import type { AiProviderConfig } from "@/types";
import type {
  JobDirection,
  Tone,
  ProjectKnowledge,
  STARExperience,
  ResumeProjectExperience,
  ResumeV2,
} from "@/types/resume";
import { formatAgentError } from "./agentError";

const JOB_HINTS: Record<JobDirection, string> = {
  backend:
    "突出架构设计、数据库与中间件、API 设计、并发与性能、可观测性、工程化（CI/CD、容器化）",
  frontend:
    "突出组件化与设计系统、首屏与运行时性能、用户体验、跨端适配、构建工具与代码规范",
  fullstack:
    "突出端到端交付、前后端协同、技术选型、部署链路、DevOps，体现独立负责能力",
};

const TONE_HINTS: Record<Tone, string> = {
  professional: "正式、专业、用术语；段落完整、句式工整。",
  concise: "短句、要点化、信息密度高；可用「；」分隔；避免冗余修饰。",
};

function buildSystemPrompt(opts: {
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
}): string {
  const jdPart = opts.jdKeywords.length
    ? `## JD 关键词（务必命中至少 50%）\n${opts.jdKeywords.join(", ")}\n\n规则：把命中的关键词显式写在对应项目的 action 字段中（仅当背景知识里真实存在对应技术时才命中，禁止编造）。`
    : "## JD 关键词\n（无）";

  return `你是一名资深技术招聘官，正在为候选人撰写「项目经历」段落。

## 岗位方向
${opts.jobDirection}（${JOB_HINTS[opts.jobDirection]}）

${jdPart}

## 语气
${TONE_HINTS[opts.tone]}

## 工作流程
1. 用 read_file 依次读取虚拟 fs 中所有 \`/knowledge/<projectId>.md\` 文件，仔细阅读每个项目的背景知识。
2. 为每个项目生成一段符合 STAR 结构的项目经历：
   - **Situation**（项目背景，60-150 字）：业务场景、目标用户、解决的问题
   - **Task**（承担任务，60-150 字）：在项目中担任的角色、面对的技术挑战
   - **Action**（技术行动，100-200 字）：采取的技术方案 / 架构决策 / 关键实现；必须使用背景知识「技术栈详情」中真实出现的术语；优先把 JD 关键词中命中的项显式提及
   - **Result**（项目成果，60-150 字）：可见的工程价值（如可维护性、可扩展性、性能、稳定性）；只在背景知识 README 中明确出现的量化数字才能引用；**禁止编造** QPS / 响应时间 / 转化率 / 用户量 等具体数字，可以用定性表述
3. 汇总所有项目，提取技能词云（去重，按重要性排序，限 15-20 个）。
4. 用 write_file 把最终结果写入虚拟 fs 的 \`/resume.json\`，schema 如下：

\`\`\`json
{
  "summary": "可选：一句话个人简介（30-80 字）",
  "skills": ["TypeScript", "React", ...],
  "experiences": [
    {
      "projectId": "<原始项目 id>",
      "projectName": "<原始项目名>",
      "techStack": ["<从背景知识抽取的、与本项目相关的核心技术，5-10 个>"],
      "star": {
        "situation": "...",
        "task": "...",
        "action": "...",
        "result": "..."
      }
    }
  ]
}
\`\`\`

## 硬性约束
- 所有内容必须基于背景知识，禁止编造项目细节、人数、时间、指标。
- 不要返回除 \`/resume.json\` 之外的多余文件。
- 用中文撰写，技术术语保留英文原文。
- experiences 数组顺序与输入项目列表一致。
- 完成后必须确保虚拟 fs 中存在合法 JSON 格式的 /resume.json。
- 不要调用 task 子 Agent；每轮最多调用一个文件工具，避免并行工具调用。
`;
}

export interface RunResumeAgentOptions {
  knowledgeDocs: ProjectKnowledge[];
  provider: AiProviderConfig;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  signal?: AbortSignal;
}

interface ResumeJsonShape {
  summary?: string;
  skills?: string[];
  experiences?: Array<{
    projectId?: string;
    projectName?: string;
    techStack?: string[];
    star?: Partial<STARExperience>;
  }>;
}

function extractFileContent(file: unknown): string {
  if (!file || typeof file !== "object") return "";
  const f = file as { content?: unknown };
  if (Array.isArray(f.content)) {
    return (f.content as unknown[]).map((s) => String(s)).join("\n");
  }
  if (typeof f.content === "string") return f.content;
  return "";
}

function safeParseJson(text: string): ResumeJsonShape | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as ResumeJsonShape;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ResumeJsonShape;
    } catch {
      return null;
    }
  }
}

export async function runResumeAgent(opts: RunResumeAgentOptions): Promise<ResumeV2> {
  if (opts.knowledgeDocs.length === 0) {
    throw new Error("至少需要 1 份项目背景知识");
  }
  const model = buildChatModel(opts.provider, { temperature: 0.4 });
  const agent = createDeepAgent({
    model,
    tools: [],
    systemPrompt: buildSystemPrompt(opts),
  });

  const nowIso = new Date().toISOString();
  const initialFiles: Record<string, {
    content: string;
    mimeType: string;
    created_at: string;
    modified_at: string;
  }> = {};
  for (const doc of opts.knowledgeDocs) {
    initialFiles[`/knowledge/${doc.projectId}.md`] = {
      content: doc.content,
      mimeType: "text/markdown",
      created_at: doc.updatedAt || nowIso,
      modified_at: doc.updatedAt || nowIso,
    };
  }

  const userMessage = [
    `请基于虚拟 fs 中 /knowledge/ 目录下的 ${opts.knowledgeDocs.length} 份项目背景知识，生成简历项目经历。`,
    `项目顺序（projectId -> projectName）：`,
    ...opts.knowledgeDocs.map(
      (d, i) => `  ${i + 1}. ${d.projectId} -> ${d.projectName}`
    ),
    ``,
    `最终请将结果写入 /resume.json。`,
  ].join("\n");

  let result: { files?: Record<string, unknown> };
  try {
    result = (await agent.invoke(
      {
        messages: [{ role: "user", content: userMessage }],
        files: initialFiles,
      } as Parameters<typeof agent.invoke>[0],
      {
        signal: opts.signal,
        recursionLimit: 40,
      } as Parameters<typeof agent.invoke>[1]
    )) as { files?: Record<string, unknown> };
  } catch (err) {
    throw new Error(formatAgentError(err));
  }

  const rawJson =
    extractFileContent(result.files?.["/resume.json"]) ||
    extractFileContent(result.files?.["resume.json"]);
  if (!rawJson.trim()) {
    throw new Error("Agent 没有产出 resume.json 文件");
  }
  const parsed = safeParseJson(rawJson);
  if (!parsed) {
    throw new Error("Agent 产出的 resume.json 不是合法 JSON");
  }

  const experiencesByInputOrder: ResumeProjectExperience[] = opts.knowledgeDocs.map(
    (doc) => {
      const matched = (parsed.experiences || []).find(
        (e) => e.projectId === doc.projectId || e.projectName === doc.projectName
      );
      const star: STARExperience = {
        situation: matched?.star?.situation ?? "",
        task: matched?.star?.task ?? "",
        action: matched?.star?.action ?? "",
        result: matched?.star?.result ?? "",
      };
      return {
        projectId: doc.projectId,
        projectName: doc.projectName,
        techStack: Array.isArray(matched?.techStack) ? (matched!.techStack as string[]) : [],
        starExperience: star,
        isEdited: false,
      };
    }
  );

  const skills = Array.isArray(parsed.skills) ? (parsed.skills as string[]) : [];

  const resume: ResumeV2 = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    jobDirection: opts.jobDirection,
    jdKeywords: opts.jdKeywords,
    tone: opts.tone,
    summary: parsed.summary?.trim() || undefined,
    skills,
    experiences: experiencesByInputOrder,
    isSaved: false,
  };

  return resume;
}
