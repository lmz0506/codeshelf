import { invoke } from "@tauri-apps/api/core";

import type { ResumeV2 } from "@/types/resume";

export type AgentRunStatus = "running" | "success" | "error" | "cancelled";
export type ToolPermissionMode = "read_only" | "workspace_write" | "full_agent";

export interface ResumeAgentPromptConfig {
  version: string;
  backgroundPrompt: string;
  resumePrompt: string;
}

export interface ArtifactRef {
  id: string;
  label: string;
  kind: string;
  chars: number;
}

export type AgentEventType = "system" | "model_call" | "tool_call" | "finalize" | "error";

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  status: string;
  at: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  turnIndex?: number;
  title?: string;
  modelProvider?: string;
  modelName?: string;
  thinkingEnabled?: boolean;
  temperature?: number;
  toolName?: string;
  returnedChars?: number;
  truncated?: boolean;
  blocked?: boolean;
  blockedBy?: string;
  data?: Record<string, unknown>;
  artifacts?: ArtifactRef[];
  error?: string;
}

export interface AgentRunRecord {
  id: string;
  requestId: string;
  projectId: string;
  status: AgentRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  modelProvider?: string;
  modelName?: string;
  promptSnapshot: ResumeAgentPromptConfig;
  toolPermissionMode: ToolPermissionMode;
  events: AgentEvent[];
  output?: {
    backgroundChars: number;
    resume?: ResumeV2;
  };
  error?: {
    message: string;
    eventId?: string;
  };
}

export interface AgentRunState {
  current?: AgentRunRecord;
}

export interface ArtifactContent {
  artifactId: string;
  content: string;
}

export interface QualityIssue {
  severity: "warn" | "error";
  code: string;
  message: string;
  section?: string;
}

export type KnowledgePromptConfig = ResumeAgentPromptConfig;
export type KnowledgeRunStatus = AgentRunStatus;
export type KnowledgeRunRecord = AgentRunRecord;
export type KnowledgeRunArtifactRef = ArtifactRef;
export type KnowledgeRunArtifactContent = ArtifactContent;

export async function loadResumeKnowledge(projectId: string): Promise<string | null> {
  return await invoke<string | null>("load_resume_agent_background", { projectId });
}

export async function saveResumeKnowledge(
  projectId: string,
  content: string,
  _userEdited: boolean,
): Promise<void> {
  await invoke<void>("save_resume_agent_background", { projectId, content });
}

export async function listResumeKnowledge(): Promise<string[]> {
  return await invoke<string[]>("list_resume_agent_background");
}

export async function deleteResumeKnowledge(projectId: string): Promise<void> {
  await invoke<void>("delete_resume_agent_background", { projectId });
}

export async function getResumeKnowledgePromptConfig(): Promise<ResumeAgentPromptConfig> {
  return await invoke<ResumeAgentPromptConfig>("get_resume_agent_prompt_config");
}

export async function saveResumeKnowledgePromptConfig(
  config: ResumeAgentPromptConfig,
): Promise<ResumeAgentPromptConfig> {
  return await invoke<ResumeAgentPromptConfig>("save_resume_agent_prompt_config", { config });
}

export async function resetResumeKnowledgePromptConfig(): Promise<ResumeAgentPromptConfig> {
  return await invoke<ResumeAgentPromptConfig>("reset_resume_agent_prompt_config");
}

export async function getResumeKnowledgeRuns(projectId: string): Promise<AgentRunState> {
  return await invoke<AgentRunState>("get_resume_agent_runs", { projectId });
}

export async function readResumeKnowledgeRunArtifact(
  projectId: string,
  artifactId: string,
): Promise<ArtifactContent> {
  return await invoke<ArtifactContent>("read_resume_agent_artifact", {
    projectId,
    artifactId,
  });
}
