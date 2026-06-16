import path from "node:path";

export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function resumeAgentRoot(dataDir: string): string {
  return path.join(dataDir, "resume_agent");
}

export function promptsFile(dataDir: string): string {
  return path.join(resumeAgentRoot(dataDir), "prompts.json");
}

export function projectDir(dataDir: string, projectId: string): string {
  return path.join(resumeAgentRoot(dataDir), "projects", sanitizeId(projectId));
}

export function backgroundFile(dataDir: string, projectId: string): string {
  return path.join(projectDir(dataDir, projectId), "background.md");
}

export function runsDir(dataDir: string, projectId: string): string {
  return path.join(projectDir(dataDir, projectId), "runs");
}

export function runDir(dataDir: string, projectId: string): string {
  return path.join(runsDir(dataDir, projectId), "current");
}

export function runFile(dataDir: string, projectId: string): string {
  return path.join(runDir(dataDir, projectId), "run.json");
}

export function artifactsDir(dataDir: string, projectId: string): string {
  return path.join(runDir(dataDir, projectId), "artifacts");
}
