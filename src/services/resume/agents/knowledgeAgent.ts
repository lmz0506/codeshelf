// 项目知识抽取 agent 的前端 IPC wrapper。Rust 侧实现在
// src-tauri/src/commands/resume_agent/knowledge_agent.rs (两步推理:规划 → 读文件 → 生成 md)。

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { AiProviderConfig, Project } from "@/types";

import type { AgentStep, AgentStepKind } from "./resumeAgent";

export type { AgentStep, AgentStepKind };

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

interface AgentStepEventPayload {
  requestId: string;
  kind: AgentStepKind;
  label?: string;
  detail?: string;
  ts: number;
}

interface RunKnowledgeAgentResponse {
  background: string;
}

export async function runKnowledgeAgent(
  opts: RunKnowledgeAgentOptions,
): Promise<KnowledgeRunResult> {
  const requestId = generateRequestId();
  const steps: AgentStep[] = [];
  const unlisten = await listen<AgentStepEventPayload>(
    "knowledge-agent-step",
    (event) => {
      if (event.payload.requestId !== requestId) return;
      const step: AgentStep = {
        kind: event.payload.kind,
        label: event.payload.label,
        detail: event.payload.detail,
        ts: event.payload.ts,
      };
      steps.push(step);
      opts.onStep?.(step);
    },
  );

  const onAbort = () => {
    void invoke("cancel_knowledge_agent", { requestId }).catch(() => {});
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const result = await invoke<RunKnowledgeAgentResponse>(
      "run_knowledge_agent",
      {
        request: {
          requestId,
          provider: opts.provider,
          projectId: opts.project.id,
          initialBackground: opts.initialBackground,
        },
      },
    );
    return { background: result.background, steps };
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
