import { z } from "zod/v4";

import type {
  GenerateResumeFragmentRequest,
  KnowledgeInput,
  ResumeProjectExperience,
} from "../types.js";
import { jsonArtifact, toJsonSafe } from "../util.js";
import { createChatModel } from "./model.js";

const starSchema = z.object({
  situation: z.string().default(""),
  task: z.string().default(""),
  action: z.string().default(""),
  result: z.string().default(""),
});

const projectExperienceSchema = z.object({
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  projectTime: z.string().optional(),
  projectRole: z.string().optional(),
  techStack: z.array(z.string()).default([]),
  starExperience: starSchema.default({
    situation: "",
    task: "",
    action: "",
    result: "",
  }),
  isEdited: z.boolean().default(false),
  evidenceFiles: z.array(z.string()).default([]),
});

export async function generateResumeFragment(
  request: GenerateResumeFragmentRequest,
): Promise<unknown> {
  const model = createChatModel(request.provider);
  const system = buildSystemPrompt(request);
  const user = buildUserPrompt(request);
  const response = await model.invoke([
    { role: "system", content: system },
    { role: "user", content: user },
  ] as never);
  const text = extractMessageText(response);
  return parseFragmentResponse(text, request);
}

function buildSystemPrompt(request: GenerateResumeFragmentRequest): string {
  const common = [
    "你是 CodeShelf 的简历内容编辑器，负责局部生成或润色简历内容。",
    "只能基于用户提供的个人资料、工作经历、技术栈、项目背景知识和现有内容改写。",
    "不要编造无法验证的公司、职责、指标、获奖、业务规模、性能数据或项目成果。",
    "量化指标只有在输入材料中明确出现时才能保留；否则改成定性表达。",
    "输出必须是 JSON，不要输出 Markdown 代码围栏。",
  ];
  switch (request.fragment.kind) {
    case "summary_generate":
      return [
        ...common,
        "任务：生成个人简介。",
        "写作方向：围绕工作经验方向、技术能力、项目领域、岗位定位，形成 2-4 句自然中文简介。",
        "输出格式：{\"summary\":\"...\"}",
      ].join("\n");
    case "summary_polish":
      return [
        ...common,
        "任务：润色个人简介。",
        "要求：保留原有事实和资历边界，提升表达密度和专业度，形成 2-4 句自然中文简介。",
        "输出格式：{\"summary\":\"...\"}",
      ].join("\n");
    case "work_polish":
      return [
        ...common,
        "任务：润色单段工作经历中的岗位职责。",
        "要求：输出 3-6 条 Markdown 列表，动词开头，体现职责、协作、技术落地和业务支撑；不要写项目经历成稿。",
        "输出格式：{\"description\":\"- ...\\n- ...\"}",
      ].join("\n");
    case "project_regenerate":
      return [
        ...common,
        "任务：重新生成单个项目经历。",
        "格式：项目描述、核心职责、项目成果。核心职责和项目成果必须是 Markdown 列表。",
        "不要单独列技术亮点，应把技术方案和职责融合到核心职责描述里。",
        "输出格式：{\"experience\":{...}}，experience 必须包含 projectId、projectName、projectTime、projectRole、techStack、starExperience、evidenceFiles。",
      ].join("\n");
  }
}

function buildUserPrompt(request: GenerateResumeFragmentRequest): string {
  const fragment = request.fragment;
  const targetDocs =
    fragment.kind === "project_regenerate"
      ? request.knowledgeDocs.filter((doc) => doc.projectId === fragment.projectId)
      : request.knowledgeDocs;
  return [
    "简历目标：",
    jsonArtifact({
      jobDirection: request.jobDirection,
      jdKeywords: request.jdKeywords,
      tone: request.tone,
      task: fragment.kind,
      userInstruction: "instruction" in fragment ? fragment.instruction || "" : "",
    }),
    "",
    "当前输入：",
    jsonArtifact(fragment),
    "",
    "背景知识：",
    formatKnowledgeDocs(targetDocs.length ? targetDocs : request.knowledgeDocs),
  ].join("\n");
}

function formatKnowledgeDocs(docs: KnowledgeInput[]): string {
  const maxTotalChars = 80_000;
  const maxDocChars = Math.max(12_000, Math.floor(maxTotalChars / Math.max(1, docs.length)));
  let used = 0;
  const sections: string[] = [];
  for (const doc of docs) {
    const remaining = Math.max(0, maxTotalChars - used);
    const limit = Math.min(maxDocChars, remaining);
    const content = limitContent(doc.content, limit);
    used += [...content].length;
    sections.push([
      `## ${doc.projectName}`,
      "",
      jsonArtifact({
        projectId: doc.projectId,
        projectName: doc.projectName,
        projectPath: doc.projectPath,
      }),
      "",
      content,
    ].join("\n"));
    if (used >= maxTotalChars) break;
  }
  return sections.join("\n\n---\n\n");
}

function parseFragmentResponse(text: string, request: GenerateResumeFragmentRequest): unknown {
  const object = asObject(parseJsonObject(text));
  if (!object) throw new Error("模型返回不是 JSON 对象");
  const fragment = request.fragment;
  switch (fragment.kind) {
    case "summary_generate":
    case "summary_polish": {
      const summary = z.object({ summary: z.string() }).parse(object).summary.trim();
      return { summary };
    }
    case "work_polish": {
      const description = z.object({ description: z.string() }).parse(object).description.trim();
      return { description: normalizeMarkdownList(description, 6) };
    }
    case "project_regenerate": {
      const candidate = asObject(object.experience) ?? object;
      const parsed = projectExperienceSchema.parse(candidate);
      const doc = request.knowledgeDocs.find((item) => item.projectId === fragment.projectId);
      return {
        experience: normalizeProjectExperience(parsed, {
          projectId: fragment.projectId,
          projectName: doc?.projectName ?? fragment.currentExperience?.projectName ?? "",
        }),
      };
    }
  }
}

function normalizeProjectExperience(
  raw: z.infer<typeof projectExperienceSchema>,
  fallback: { projectId: string; projectName: string },
): ResumeProjectExperience {
  return {
    projectId: raw.projectId?.trim() || fallback.projectId,
    projectName: raw.projectName?.trim() || fallback.projectName,
    projectTime: raw.projectTime?.trim() || undefined,
    projectRole: raw.projectRole?.trim() || undefined,
    techStack: uniqueStrings(raw.techStack).slice(0, 14),
    starExperience: {
      situation: raw.starExperience.situation.trim(),
      task: raw.starExperience.task.trim(),
      action: normalizeMarkdownList(raw.starExperience.action, 8),
      result: normalizeMarkdownList(raw.starExperience.result, 4),
    },
    isEdited: false,
    evidenceFiles: uniqueStrings(raw.evidenceFiles).slice(0, 20),
  };
}

function normalizeMarkdownList(text: string, maxItems: number): string {
  const items = splitMarkdownItems(text).slice(0, maxItems);
  return items.map((item) => `- ${item}`).join("\n");
}

function splitMarkdownItems(text: string): string[] {
  const value = text.trim();
  if (!value) return [];
  const lines = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const markdownLines = lines.filter((line) => /^([-*•]|\d+[.)、])\s+/.test(line));
  if (markdownLines.length >= 2) {
    return uniqueStrings(markdownLines.map(stripListMarker).filter(Boolean));
  }
  const sentenceItems = value
    .split(/(?<=[。!?；;！？])\s*/)
    .flatMap((item) => item.split(/\s*[；;]\s*/))
    .map(stripListMarker)
    .filter(Boolean);
  if (sentenceItems.length > 1) return uniqueStrings(sentenceItems);
  return uniqueStrings([stripListMarker(value)].filter(Boolean));
}

function stripListMarker(text: string): string {
  return text
    .trim()
    .replace(/^[-*•]\s+/u, "")
    .replace(/^\d+[.)、]\s*/u, "")
    .trim();
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function limitContent(content: string, maxChars: number): string {
  if ([...content].length <= maxChars) return content;
  return `${[...content].slice(0, maxChars).join("")}\n\n[背景知识过长，已截断；只允许基于可见内容生成]`;
}

function extractMessageText(message: unknown): string {
  const safe = asObject(toJsonSafe(message));
  const kwargs = asObject(safe?.kwargs);
  return firstNonEmptyString(
    contentToText(kwargs?.content),
    contentToText(safe?.content),
    typeof safe?.text === "string" ? safe.text : "",
  );
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("模型返回不是 JSON");
    }
    return JSON.parse(unfenced.slice(start, end + 1));
  }
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      const object = asObject(item);
      return typeof object?.text === "string" ? object.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function firstNonEmptyString(...values: string[]): string {
  return values.find((value) => value.trim().length > 0) ?? "";
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
