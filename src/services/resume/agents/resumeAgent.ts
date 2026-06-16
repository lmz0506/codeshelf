import { invoke } from "@tauri-apps/api/core";

import type { AiProviderConfig } from "@/types";
import type {
  JobDirection,
  ProjectKnowledge,
  ResumeV2,
  Tone,
} from "@/types/resume";

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

export interface RunResumeAgentOptions {
  knowledgeDocs: ProjectKnowledge[];
  provider: AiProviderConfig;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal;
}

export async function runResumeAgent(opts: RunResumeAgentOptions): Promise<ResumeV2> {
  const requestId = generateRequestId();
  const onAbort = () => {
    void invoke("cancel_resume_deep_agent", { requestId }).catch(() => {});
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (opts.signal?.aborted) {
      throw new Error("简历生成已取消");
    }
    opts.onStep?.({
      kind: "llm_text",
      label: "读取背景知识",
      detail: `${opts.knowledgeDocs.length} 份`,
      ts: Date.now(),
    });
    opts.onStep?.({
      kind: "llm_text",
      label: "调用模型生成简历",
      detail: "基于已生成背景知识，不再重新运行 Deep Agent",
      ts: Date.now(),
    });
    const resume = await invoke<ResumeV2>("generate_resume_from_knowledge", {
      request: {
        requestId,
        provider: opts.provider,
        jobDirection: opts.jobDirection,
        jdKeywords: opts.jdKeywords,
        tone: opts.tone,
        promptConfig: null,
        knowledgeDocs: opts.knowledgeDocs.map((doc) => ({
          projectId: doc.projectId,
          projectName: doc.projectName,
          projectPath: doc.projectPath,
          content: doc.content,
        })),
      },
    });
    opts.onStep?.({
      kind: "llm_text",
      label: "简历生成完成",
      detail: `${resume.experiences.length} 个项目 · ${resume.skills.length} 个技能词`,
      ts: Date.now(),
    });
    return resume;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
