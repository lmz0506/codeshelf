// 简历生成 agent 的前端 IPC wrapper。
//
// 历史:此文件曾用 deepagents + langchain 在前端跑工具循环,会触发 new Function/eval,
//      跟 v0.1.28 引入的严格 CSP 冲突 → 透明白屏。现在把整套 agent 挪到 Rust 侧的
//      run_resume_agent command,前端只 invoke + 监听 step 事件。

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

// Rust 侧 commands/resume_agent/types.rs::AgentStepEvent 的镜像。
// 不放进 bindings.ts (它只在 emit 事件里用,不在任何 command 返回值里出现,
// specta 不会自动收集);手写一份保持字段对齐。
interface AgentStepEventPayload {
  requestId: string;
  kind: AgentStepKind;
  label?: string;
  detail?: string;
  ts: number;
}

interface RunResumeAgentResponse {
  resume: ResumeV2;
}

export async function runResumeAgent(
  opts: RunResumeAgentOptions,
): Promise<ResumeV2> {
  const requestId = generateRequestId();
  const unlisten = await listen<AgentStepEventPayload>(
    "resume-agent-step",
    (event) => {
      if (event.payload.requestId !== requestId) return;
      opts.onStep?.({
        kind: event.payload.kind,
        label: event.payload.label,
        detail: event.payload.detail,
        ts: event.payload.ts,
      });
    },
  );

  const onAbort = () => {
    void invoke("cancel_resume_agent", { requestId }).catch(() => {});
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const result = await invoke<RunResumeAgentResponse>("run_resume_agent", {
      request: {
        requestId,
        provider: opts.provider,
        knowledgeDocs: opts.knowledgeDocs.map((d) => ({
          projectId: d.projectId,
          projectName: d.projectName,
          content: d.content,
          updatedAt: d.updatedAt,
        })),
        jobDirection: opts.jobDirection,
        jdKeywords: opts.jdKeywords,
        tone: opts.tone,
      },
    });
    return result.resume;
  } finally {
    unlisten();
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
