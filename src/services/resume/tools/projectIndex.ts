import { invoke } from "@tauri-apps/api/core";

export interface ResumeProjectIndexFile {
  path: string;
  size: number;
  extension?: string | null;
}

export interface ResumeProjectIndexStats {
  file_count: number;
  directory_count: number;
  total_bytes: number;
}

export interface ResumeProjectIndex {
  root_name: string;
  files: ResumeProjectIndexFile[];
  directories: string[];
  stats: ResumeProjectIndexStats;
}

export function loadProjectIndex(projectId: string): Promise<ResumeProjectIndex> {
  return invoke<ResumeProjectIndex>("resume_project_index", { projectId });
}

export function readProjectFile(projectId: string, path: string): Promise<string> {
  return invoke<string>("resume_project_read_file", { projectId, path });
}
