import fs from "node:fs/promises";
import path from "node:path";

import { startRpc, sendEvent } from "./rpc.js";
import { generateResumeFragment } from "./agent/fragments.js";
import { generateResumeFromKnowledge } from "./agent/generateResume.js";
import { runResumeDeepAgent } from "./agent/runAgent.js";
import {
  deleteProjectKnowledge,
  listBackgroundProjects,
  loadBackground,
  readArtifact,
  readRuns,
  saveBackground,
} from "./storage/runStore.js";
import { loadPromptConfig, resetPromptConfig, savePromptConfig } from "./storage/promptStore.js";
import type { RpcRequest } from "./types.js";

const controllers = new Map<string, AbortController>();

startRpc(async (request: RpcRequest) => {
  switch (request.method) {
    case "run_agent": {
      const controller = new AbortController();
      controllers.set(request.params.requestId, controller);
      try {
        return await runResumeDeepAgent(request.params, controller.signal, (run) => {
          sendEvent({
            type: "event",
            requestId: request.params.requestId,
            projectId: request.params.project.id,
            run,
          });
        });
      } finally {
        controllers.delete(request.params.requestId);
      }
    }
    case "generate_resume":
      return await generateResumeFromKnowledge(request.params);
    case "generate_resume_fragment":
      return await generateResumeFragment(request.params);
    case "cancel_run": {
      controllers.get(request.params.requestId)?.abort();
      return null;
    }
    case "get_runs":
      return await readRuns(request.params.dataDir, request.params.projectId);
    case "read_artifact":
      return await readArtifact(
        request.params.dataDir,
        request.params.projectId,
        request.params.artifactId,
      );
    case "get_prompt_config":
      return await loadPromptConfig(request.params.dataDir);
    case "save_prompt_config":
      return await savePromptConfig(request.params.dataDir, request.params.config);
    case "reset_prompt_config":
      return await resetPromptConfig(request.params.dataDir);
    case "load_background":
      return await loadBackground(request.params.dataDir, request.params.projectId);
    case "save_background":
      await saveBackground(request.params.dataDir, request.params.projectId, request.params.content);
      return null;
    case "list_background":
      return await listBackgroundProjects(request.params.dataDir);
    case "delete_background":
      await deleteProjectKnowledge(request.params.dataDir, request.params.projectId);
      return null;
    default:
      throw new Error(`Unknown method ${(request as { method: string }).method}`);
  }
});

process.on("uncaughtException", (err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
});

process.on("unhandledRejection", (err) => {
  process.stderr.write(`${err instanceof Error ? err.stack || err.message : String(err)}\n`);
});

async function ensureWorkingDir(): Promise<void> {
  if (process.argv.includes("--print-ready")) {
    process.stdout.write("ready\n");
  }
  const dir = path.dirname(new URL(import.meta.url).pathname);
  await fs.access(dir);
}

void ensureWorkingDir();
