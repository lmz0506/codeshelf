import type { AgentEvent, AgentRunRecord, ArtifactRef, RunAgentRequest } from "../types.js";
import { appendEvent, writeArtifact, writeRun } from "../storage/runStore.js";
import { durationMs, jsonArtifact, newId, nowIso } from "../util.js";

export type EmitRun = (run: AgentRunRecord) => void;

export class RunContext {
  run: AgentRunRecord;

  constructor(
    private readonly request: RunAgentRequest,
    initialRun: AgentRunRecord,
    private readonly emit: EmitRun,
  ) {
    this.run = initialRun;
  }

  get dataDir(): string {
    return this.request.dataDir;
  }

  get projectId(): string {
    return this.request.project.id;
  }

  async artifact(fileName: string, label: string, kind: string, content: string): Promise<ArtifactRef> {
    return writeArtifact(this.dataDir, this.projectId, fileName, label, kind, content);
  }

  async event(event: Omit<AgentEvent, "id" | "at"> & Partial<Pick<AgentEvent, "id" | "at">>): Promise<AgentEvent> {
    const next: AgentEvent = {
      id: event.id ?? newId(event.type),
      at: event.at ?? nowIso(),
      ...event,
    };
    this.run = await appendEvent(this.dataDir, this.run, next);
    this.emit(this.run);
    return next;
  }

  async updateRun(mutator: (run: AgentRunRecord) => AgentRunRecord): Promise<void> {
    this.run = mutator(this.run);
    await writeRun(this.dataDir, this.run);
    this.emit(this.run);
  }

  async timedToolEvent<T>(input: {
    toolName: string;
    title?: string;
    args: unknown;
    run: () => Promise<T>;
    resultToArtifact?: (result: T) => string;
    blocked?: boolean;
    blockedBy?: string;
  }): Promise<T> {
    const startedAt = nowIso();
    const argsArtifact = await this.artifact(
      `${input.toolName}.arguments.json`,
      "Arguments",
      "tool_arguments",
      JSON.stringify(input.args, null, 2),
    );
    try {
      const result = await input.run();
      const finishedAt = nowIso();
      const content = input.resultToArtifact
        ? input.resultToArtifact(result)
        : jsonArtifact(result);
      const resultArtifact = await this.artifact(
        `${input.toolName}.result.txt`,
        "Result",
        "tool_result",
        content,
      );
      const toolError = getToolResultError(result);
      const exitCode = getExitCode(result);
      await this.event({
        type: "tool_call",
        status: input.blocked ? "blocked" : toolError ? "error" : "success",
        title: input.title,
        startedAt,
        finishedAt,
        durationMs: durationMs(startedAt, finishedAt),
        toolName: input.toolName,
        returnedChars: [...content].length,
        blocked: input.blocked,
        blockedBy: input.blockedBy,
        error: toolError,
        data: {
          input: {
            argsPreview: summarizeToolValue(input.args),
            todos: extractTodos(input.args),
          },
          outputPreview: summarizeToolValue(result),
          exitCode,
        },
        artifacts: [argsArtifact, resultArtifact],
      });
      return result;
    } catch (err) {
      const finishedAt = nowIso();
      const message = err instanceof Error ? err.message : String(err);
      const errorArtifact = await this.artifact(`${input.toolName}.error.json`, "Error", "tool_error", jsonArtifact({ error: message }));
      await this.event({
        type: "tool_call",
        status: "error",
        title: input.title,
        startedAt,
        finishedAt,
        durationMs: durationMs(startedAt, finishedAt),
        toolName: input.toolName,
        error: message,
        artifacts: [argsArtifact, errorArtifact],
      });
      throw err;
    }
  }
}

function getToolResultError(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const exitCode = getExitCode(result);
  if (typeof exitCode === "number" && exitCode !== 0) return `exitCode ${exitCode}`;
  if (!("error" in result)) return undefined;
  const error = (result as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : undefined;
}

function getExitCode(result: unknown): number | undefined {
  if (!result || typeof result !== "object" || !("exitCode" in result)) return undefined;
  const code = (result as { exitCode?: unknown }).exitCode;
  return typeof code === "number" && Number.isFinite(code) ? code : undefined;
}

function summarizeToolValue(value: unknown): string {
  const todos = extractTodos(value);
  if (todos?.length) {
    return `${todos.length} todos: ${todos.slice(0, 3).map((todo) => todo.content).filter(Boolean).join(" / ")}`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.paths)) {
      const paths = object.paths.slice(0, 5).map(String);
      return `paths: ${paths.join(", ")}${object.paths.length > 5 ? " ..." : ""}`;
    }
    if (typeof object.file_path === "string") return object.file_path;
    if (typeof object.path === "string") return object.path;
    if (typeof object.pattern === "string") return object.pattern;
    if (typeof object.command === "string") return object.command;
    if (typeof object.output === "string") {
      const prefix = typeof object.exitCode === "number" ? `exitCode ${object.exitCode}: ` : "";
      return limitForEvent(`${prefix}${object.output}`, 1000);
    }
  }
  return limitForEvent(jsonArtifact(value), 1000);
}

function extractTodos(value: unknown): Array<{ content?: string; status?: string }> | undefined {
  if (!value || typeof value !== "object" || !Array.isArray((value as { todos?: unknown }).todos)) return undefined;
  const result: Array<{ content?: string; status?: string }> = [];
  for (const item of (value as { todos: unknown[] }).todos) {
    if (!item || typeof item !== "object") continue;
    const todo = item as { content?: unknown; status?: unknown };
    result.push({
      content: typeof todo.content === "string" ? todo.content : undefined,
      status: typeof todo.status === "string" ? todo.status : undefined,
    });
  }
  return result;
}

function limitForEvent(text: string, maxChars: number): string {
  if ([...text].length <= maxChars) return text;
  return `${[...text].slice(0, maxChars).join("")}\n[truncated]`;
}
