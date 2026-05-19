import { invoke } from "@tauri-apps/api/core";

export interface ResumeKnowledgeHistoryEntry {
  timestamp: string;
  size: number;
}

export async function loadResumeKnowledge(projectId: string): Promise<string | null> {
  return await invoke<string | null>("load_resume_knowledge", { projectId });
}

export async function saveResumeKnowledge(
  projectId: string,
  content: string,
  userEdited: boolean
): Promise<void> {
  await invoke<void>("save_resume_knowledge", {
    projectId,
    content,
    userEdited,
  });
}

export async function listResumeKnowledge(): Promise<string[]> {
  return await invoke<string[]>("list_resume_knowledge");
}

export async function listResumeKnowledgeHistory(
  projectId: string
): Promise<ResumeKnowledgeHistoryEntry[]> {
  return await invoke<ResumeKnowledgeHistoryEntry[]>("list_resume_knowledge_history", {
    projectId,
  });
}

export async function readResumeKnowledgeHistory(
  projectId: string,
  timestamp: string
): Promise<string> {
  return await invoke<string>("read_resume_knowledge_history", {
    projectId,
    timestamp,
  });
}

export async function deleteResumeKnowledge(projectId: string): Promise<void> {
  await invoke<void>("delete_resume_knowledge", { projectId });
}
