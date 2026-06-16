import { z } from "zod/v4";

import { loadPromptConfig } from "../storage/promptStore.js";
import type {
  GenerateResumeRequest,
  KnowledgeInput,
  ResumeProjectExperience,
  ResumeV2,
} from "../types.js";
import { jsonArtifact, newId, nowIso, toJsonSafe } from "../util.js";
import { createChatModel } from "./model.js";

const starSchema = z.object({
  situation: z.string().default(""),
  task: z.string().default(""),
  action: z.string().default(""),
  result: z.string().default(""),
});

const experienceSchema = z.object({
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

const resumeResponseSchema = z.object({
  summary: z.string().optional(),
  skills: z.array(z.string()).default([]),
  experiences: z.array(experienceSchema).default([]),
});

type ResumeResponse = z.infer<typeof resumeResponseSchema>;
type ExperienceResponse = z.infer<typeof experienceSchema>;

export async function generateResumeFromKnowledge(
  request: GenerateResumeRequest,
): Promise<ResumeV2> {
  if (request.knowledgeDocs.length === 0) {
    throw new Error("生成简历失败：没有可用的背景知识");
  }
  const prompt = request.promptConfig ?? await loadPromptConfig(request.dataDir);
  const model = createChatModel(request.provider);
  const response = await model.invoke([
    { role: "system", content: prompt.resumePrompt },
    { role: "user", content: buildUserPrompt(request) },
  ] as never);
  const text = extractMessageText(response);
  const parsed = parseResumeResponse(text);
  return normalizeResume(parsed, request);
}

function buildUserPrompt(request: GenerateResumeRequest): string {
  return [
    "请基于以下背景知识生成完整简历 JSON。",
    "",
    "简历目标:",
    jsonArtifact({
      jobDirection: request.jobDirection,
      jdKeywords: request.jdKeywords,
      tone: request.tone,
      projectCount: request.knowledgeDocs.length,
    }),
    "",
    "背景知识:",
    formatKnowledgeDocs(request.knowledgeDocs),
  ].join("\n");
}

function formatKnowledgeDocs(docs: KnowledgeInput[]): string {
  const maxTotalChars = 140_000;
  const maxDocChars = Math.max(20_000, Math.floor(maxTotalChars / Math.max(1, docs.length)));
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

function limitContent(content: string, maxChars: number): string {
  if ([...content].length <= maxChars) return content;
  return `${[...content].slice(0, maxChars).join("")}\n\n[背景知识过长，已截断；只允许基于可见内容生成]`;
}

function parseResumeResponse(text: string): ResumeResponse {
  const root = parseJsonObject(text);
  const object = asObject(root);
  const candidate = asObject(object?.resume) ?? asObject(object?.data) ?? object;
  if (!candidate) throw new Error("模型返回不是 JSON 对象");
  return resumeResponseSchema.parse(candidate);
}

function normalizeResume(parsed: ResumeResponse, request: GenerateResumeRequest): ResumeV2 {
  const now = nowIso();
  const experiences = request.knowledgeDocs.map((doc, index) => {
    const raw = pickExperienceForDoc(parsed.experiences, doc, index);
    return normalizeExperience(raw, doc);
  });
  const skills = uniqueStrings([
    ...parsed.skills,
    ...experiences.flatMap((item) => item.techStack),
  ]).slice(0, 24);

  return {
    id: newId("resume"),
    createdAt: now,
    updatedAt: now,
    jobDirection: request.jobDirection,
    jdKeywords: request.jdKeywords,
    tone: request.tone,
    summary: parsed.summary?.trim() || undefined,
    skills,
    experiences,
    isSaved: false,
  };
}

function pickExperienceForDoc(
  experiences: ExperienceResponse[],
  doc: KnowledgeInput,
  index: number,
): ExperienceResponse | undefined {
  return experiences.find((item) => item.projectId === doc.projectId)
    ?? experiences.find((item) => item.projectName === doc.projectName)
    ?? experiences[index];
}

function normalizeExperience(
  raw: ExperienceResponse | undefined,
  doc: KnowledgeInput,
): ResumeProjectExperience {
  return {
    projectId: raw?.projectId?.trim() || doc.projectId,
    projectName: raw?.projectName?.trim() || doc.projectName,
    projectTime: raw?.projectTime?.trim() || undefined,
    projectRole: raw?.projectRole?.trim() || undefined,
    techStack: uniqueStrings(raw?.techStack ?? []).slice(0, 14),
    starExperience: {
      situation: raw?.starExperience.situation.trim() ?? "",
      task: raw?.starExperience.task.trim() ?? "",
      action: normalizeMarkdownList(raw?.starExperience.action ?? "", 8),
      result: normalizeMarkdownList(raw?.starExperience.result ?? "", 4),
    },
    isEdited: false,
    evidenceFiles: uniqueStrings(raw?.evidenceFiles ?? []).slice(0, 20),
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
