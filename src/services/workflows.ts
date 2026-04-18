import { invoke } from "@tauri-apps/api/core";

export interface WorkflowNode {
  id: string;
  nodeType: "web_fetch" | "llm" | "webhook" | string;
  config: Record<string, any>;
  dependsOn: string[];
}

export interface WorkflowRun {
  startedAt: string;
  finishedAt: string;
  status: "success" | "failure" | "running";
  outputs: Record<string, string>;
  error?: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  nodes: WorkflowNode[];
  lastRun?: WorkflowRun | null;
  createdAt: string;
  updatedAt: string;
}

export async function listWorkflows(): Promise<Workflow[]> {
  return invoke("workflow_list");
}
export async function getWorkflow(id: string): Promise<Workflow> {
  return invoke("workflow_get", { id });
}
export async function saveWorkflow(workflow: Workflow): Promise<Workflow> {
  return invoke("workflow_save", { workflow });
}
export async function deleteWorkflow(id: string): Promise<void> {
  return invoke("workflow_delete", { id });
}
export async function runWorkflowNow(id: string): Promise<WorkflowRun> {
  return invoke("workflow_run_now", { id });
}
export async function setWorkflowEnabled(id: string, enabled: boolean): Promise<Workflow> {
  return invoke("workflow_set_enabled", { id, enabled });
}
