import { invoke } from "@tauri-apps/api/core";

/// 后端 QualityIssue 镜像。
export type QualityIssueSeverity = "warn" | "error";
export type QualityIssueCode =
  | "missing_section"
  | "empty_section"
  | "placeholder_left"
  | "low_confidence"
  | string;

export interface QualityIssue {
  severity: QualityIssueSeverity;
  code: QualityIssueCode;
  message: string;
  section?: string;
}

export type KnowledgeRunStatus = "success" | "error" | "cancelled" | "manual";
export type KnowledgeRunSource = "agent" | "manual";

/// 后端 KnowledgeRunMeta 镜像。一次 agent 运行(或一次手编保存)的元信息。
export interface KnowledgeRunMeta {
  requestId: string;
  modelProvider?: string;
  modelName?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stepCount: number;
  source: KnowledgeRunSource;
  status: KnowledgeRunStatus;
  error?: string;
  qualityIssues: QualityIssue[];
}

/// 历史列表条目。从 sidecar (.meta.json / .fail.json) 反序列化后跟 .md 合并。
/// legacy 条目(只有 .md)回落 status: "success",其他字段 undefined。
export interface ResumeKnowledgeHistoryEntry {
  timestamp: string;
  size: number;
  status: KnowledgeRunStatus;
  hasContent: boolean;
  modelName?: string;
  durationMs?: number;
  stepCount?: number;
  qualityWarningCount?: number;
  qualityErrorCount?: number;
  error?: string;
}

export interface ReadKnowledgeHistoryResponse {
  content?: string;
  meta?: KnowledgeRunMeta;
}

export async function loadResumeKnowledge(projectId: string): Promise<string | null> {
  return await invoke<string | null>("load_resume_knowledge", { projectId });
}

/// 保存当前活动版本的背景知识。
/// - 已存在的旧版本会被自动备份到 `<id>.history/<ts>.md` + `.meta.json`(若有)。
/// - `meta` 传 agent 跑完拿到的 KnowledgeRunMeta;手编保存时传 undefined,后端合成 manual 元信息。
export async function saveResumeKnowledge(
  projectId: string,
  content: string,
  userEdited: boolean,
  meta?: KnowledgeRunMeta,
): Promise<void> {
  await invoke<void>("save_resume_knowledge", {
    projectId,
    content,
    userEdited,
    meta: meta ?? null,
  });
}

export async function listResumeKnowledge(): Promise<string[]> {
  return await invoke<string[]>("list_resume_knowledge");
}

export async function listResumeKnowledgeHistory(
  projectId: string,
): Promise<ResumeKnowledgeHistoryEntry[]> {
  return await invoke<ResumeKnowledgeHistoryEntry[]>("list_resume_knowledge_history", {
    projectId,
  });
}

export async function readResumeKnowledgeHistory(
  projectId: string,
  timestamp: string,
): Promise<ReadKnowledgeHistoryResponse> {
  return await invoke<ReadKnowledgeHistoryResponse>("read_resume_knowledge_history", {
    projectId,
    timestamp,
  });
}

export async function deleteResumeKnowledge(projectId: string): Promise<void> {
  await invoke<void>("delete_resume_knowledge", { projectId });
}

/// 记录一次 agent 失败/取消运行(无 .md 内容,仅 fail.json)。
/// 用于事后追溯:历史列表会出现该条目带状态/模型/错误信息,但不能 restore。
export async function recordKnowledgeFailure(
  projectId: string,
  meta: KnowledgeRunMeta,
): Promise<void> {
  await invoke<void>("record_knowledge_failure", { projectId, meta });
}
