import { buildChatModel } from "../llmFactory";
import {
  loadProjectIndex,
  readProjectFile,
  type ResumeProjectIndex,
  type ResumeProjectIndexFile,
} from "../tools/projectIndex";
import type { AiProviderConfig, Project } from "@/types";
import { formatAgentError } from "./agentError";

const MAX_PLAN_FILES = 45;
const MAX_CANDIDATE_FILES = 220;
const MAX_CONTEXT_CHARS = 120_000;

export type AgentStepKind =
  | "tool_call"
  | "tool_result"
  | "todo_update"
  | "llm_text"
  | "error";

export interface AgentStep {
  kind: AgentStepKind;
  label?: string;
  detail?: string;
  ts: number;
}

export interface KnowledgeRunResult {
  background: string;
  steps: AgentStep[];
}

export interface RunKnowledgeAgentOptions {
  project: Project;
  provider: AiProviderConfig;
  initialBackground?: string;
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal;
}

interface ReadPlan {
  files: string[];
  reasons?: Record<string, string>;
}

function messageText(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return "";
      })
      .join("\n");
  }
  return String(content ?? "");
}

function parseJsonObject<T>(text: string): T {
  const direct = text.trim();
  try {
    return JSON.parse(direct) as T;
  } catch {
    const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced.trim()) as T;
      } catch {
        // fall through
      }
    }
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as T;
    }
    throw new Error("模型没有返回合法 JSON");
  }
}

function isTextLike(file: ResumeProjectIndexFile): boolean {
  const ext = file.extension ?? "";
  if (!ext) return /(^|\/)(README|Dockerfile|Makefile|LICENSE|NOTICE)$/i.test(file.path);
  return [
    "ts",
    "tsx",
    "js",
    "jsx",
    "vue",
    "svelte",
    "rs",
    "java",
    "kt",
    "go",
    "py",
    "cs",
    "php",
    "rb",
    "md",
    "json",
    "toml",
    "yaml",
    "yml",
    "xml",
    "gradle",
    "properties",
    "env",
    "sql",
    "html",
    "css",
    "scss",
  ].includes(ext);
}

function scoreFile(file: ResumeProjectIndexFile): number {
  const p = file.path.replace(/\\/g, "/");
  const name = p.split("/").pop() ?? p;
  let score = 0;
  if (/^readme/i.test(name)) score += 1000;
  if (
    /^(package\.json|pom\.xml|build\.gradle|settings\.gradle|Cargo\.toml|go\.mod|pyproject\.toml|requirements\.txt|composer\.json|Gemfile|tauri\.conf\.json)$/i.test(
      name
    )
  ) {
    score += 900;
  }
  if (/^(vite|webpack|rollup|next|nuxt|svelte|tsconfig|eslint|prettier|tailwind|docker|compose|Dockerfile)/i.test(name)) {
    score += 420;
  }
  if (/(^|\/)(src|app|pages|router|routes|store|stores|api|services|components|commands|controllers|service|domain|models)\//i.test(p)) {
    score += 180;
  }
  if (/(^|\/)(main|index|app|root|layout|server|lib)\.(ts|tsx|js|jsx|vue|rs|java|go|py)$/i.test(p)) {
    score += 260;
  }
  if (/(auth|login|user|project|resume|knowledge|agent|llm|ai|chat|tool|workflow|storage|db|api|route|controller|service|store)/i.test(p)) {
    score += 160;
  }
  if (file.size > 0 && file.size <= 80_000) score += 30;
  if (file.size > 300_000) score -= 200;
  if (!isTextLike(file)) score -= 1000;
  return score;
}

function buildIndexSummary(index: ResumeProjectIndex, project: Project): string {
  const extStats = new Map<string, number>();
  for (const file of index.files) {
    const key = file.extension || "(no ext)";
    extStats.set(key, (extStats.get(key) ?? 0) + 1);
  }
  const topExts = [...extStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ext, count]) => `${ext}:${count}`)
    .join(", ");
  const topDirs = index.directories
    .filter((d) => !d.includes("/"))
    .slice(0, 80)
    .join("\n");
  const candidates = index.files
    .filter(isTextLike)
    .map((file) => ({ file, score: scoreFile(file) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .slice(0, MAX_CANDIDATE_FILES)
    .map(({ file }) => `${file.path} (${file.size} bytes)`)
    .join("\n");

  return [
    `项目名：${project.name}`,
    `项目路径：${project.path}`,
    `分类：${project.tags.join(", ") || "未分类"}`,
    `标签：${project.labels.join(", ") || "无"}`,
    `索引根目录：${index.root_name}`,
    `文件数：${index.stats.file_count}，目录数：${index.stats.directory_count}，总字节：${index.stats.total_bytes}`,
    `主要扩展名：${topExts || "无"}`,
    "",
    "一级目录：",
    topDirs || "(无)",
    "",
    "候选关键文件（已由程序基于完整索引筛选，模型只能从这些文件中规划读取）：",
    candidates || "(无)",
  ].join("\n");
}

function normalizePlan(plan: ReadPlan, index: ResumeProjectIndex): string[] {
  const existing = new Set(index.files.map((f) => f.path));
  const files = Array.isArray(plan.files) ? plan.files : [];
  const normalized: string[] = [];
  for (const raw of files) {
    const path = String(raw).replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
    if (!path || path.includes("..") || normalized.includes(path) || !existing.has(path)) {
      continue;
    }
    normalized.push(path);
    if (normalized.length >= MAX_PLAN_FILES) break;
  }
  return normalized;
}

function fallbackPlan(index: ResumeProjectIndex): string[] {
  return index.files
    .filter(isTextLike)
    .map((file) => ({ file, score: scoreFile(file) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .slice(0, Math.min(24, MAX_PLAN_FILES))
    .map(({ file }) => file.path);
}

function buildFileContext(files: Array<{ path: string; content: string }>): string {
  let total = 0;
  const chunks: string[] = [];
  for (const file of files) {
    const header = `\n\n--- FILE: ${file.path} ---\n`;
    const remaining = MAX_CONTEXT_CHARS - total - header.length;
    if (remaining <= 0) break;
    const content =
      file.content.length > remaining
        ? `${file.content.slice(0, Math.max(0, remaining - 80))}\n[context truncated]`
        : file.content;
    chunks.push(`${header}${content}`);
    total += header.length + content.length;
  }
  return chunks.join("");
}

export async function runKnowledgeAgent(
  opts: RunKnowledgeAgentOptions
): Promise<KnowledgeRunResult> {
  const model = buildChatModel(opts.provider, { temperature: 0.2 });
  const steps: AgentStep[] = [];
  const pushStep = (step: AgentStep) => {
    steps.push(step);
    opts.onStep?.(step);
  };

  try {
    pushStep({ kind: "tool_call", label: "建立项目索引", ts: Date.now() });
    const index = await loadProjectIndex(opts.project.id);
    pushStep({
      kind: "tool_result",
      label: "项目索引完成",
      detail: `${index.stats.file_count} 个文件，${index.stats.directory_count} 个目录`,
      ts: Date.now(),
    });

    const indexSummary = buildIndexSummary(index, opts.project);
    pushStep({ kind: "llm_text", detail: "规划需要读取的关键文件", ts: Date.now() });
    const planResponse = await model.invoke(
      [
        {
          role: "system",
          content:
            "你是资深技术架构师。你只能基于用户提供的项目索引规划读取哪些文件。必须返回严格 JSON，不要 Markdown。",
        },
        {
          role: "user",
          content: [
            "请从候选关键文件中选择最能支持生成项目背景知识的文件。",
            `最多选择 ${MAX_PLAN_FILES} 个。优先 README、依赖文件、入口、路由、状态管理、后端 controller/service、数据库/存储、AI/工具相关模块。`,
            "返回格式：{\"files\":[\"path\"],\"reasons\":{\"path\":\"选择原因\"}}",
            "",
            indexSummary,
          ].join("\n"),
        },
      ],
      { signal: opts.signal }
    );
    const parsedPlan = parseJsonObject<ReadPlan>(messageText(planResponse));
    let plannedFiles = normalizePlan(parsedPlan, index);
    if (plannedFiles.length === 0) {
      plannedFiles = fallbackPlan(index);
    }
    if (plannedFiles.length === 0) {
      throw new Error("没有找到可读取的关键项目文件");
    }
    pushStep({
      kind: "todo_update",
      detail: `计划读取 ${plannedFiles.length} 个文件`,
      ts: Date.now(),
    });

    const readFiles: Array<{ path: string; content: string }> = [];
    for (const path of plannedFiles) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      pushStep({ kind: "tool_call", label: "读取文件", detail: path, ts: Date.now() });
      const content = await readProjectFile(opts.project.id, path);
      readFiles.push({ path, content });
      pushStep({
        kind: "tool_result",
        label: path,
        detail: `${content.length} 字符`,
        ts: Date.now(),
      });
    }

    pushStep({ kind: "llm_text", detail: "生成背景知识文档", ts: Date.now() });
    const context = buildFileContext(readFiles);
    const finalResponse = await model.invoke(
      [
        {
          role: "system",
          content:
            "你是一名资深技术架构师，正在为求职者整理项目背景知识文档。所有事实必须来自项目索引和已读取文件，禁止编造。用中文输出 Markdown。",
        },
        {
          role: "user",
          content: [
            opts.initialBackground
              ? "这是更新流程。请结合现有背景知识和当前读到的项目文件，输出完整最新版 /background.md 内容。"
              : "这是首次生成流程。请输出完整 /background.md 内容。",
            "",
            "固定章节：",
            "# {项目名}",
            "## 项目概览",
            "## 技术栈详情",
            "## 核心功能模块",
            "## 架构亮点",
            "## 可挂载 JD 关键词",
            "",
            "约束：",
            "- 技术栈必须来自依赖文件、配置文件或代码。",
            "- 量化指标只在 README 或代码中明确出现时引用。",
            "- 核心功能模块必须列出入口路径、关键文件、实现要点。",
            "- 不要贴整段源码。",
            "- 如果某类信息无法从文件确认，请写“未从当前项目文件确认”。",
            "",
            "项目索引摘要：",
            indexSummary,
            "",
            opts.initialBackground
              ? `现有背景知识：\n${opts.initialBackground}`
              : "现有背景知识：无",
            "",
            "已读取文件内容：",
            context,
          ].join("\n"),
        },
      ],
      { signal: opts.signal }
    );

    const background = messageText(finalResponse).trim();
    if (!background) {
      throw new Error("模型没有产出背景知识内容");
    }
    return { background, steps };
  } catch (err) {
    const message = formatAgentError(err);
    pushStep({ kind: "error", detail: message, ts: Date.now() });
    throw new Error(message);
  }
}
