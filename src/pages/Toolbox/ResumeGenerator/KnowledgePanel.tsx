import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Bot,
  Braces,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileJson,
  FileText,
  History,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";

import type { AiProviderConfig, Project } from "@/types";
import type { ProjectKnowledge } from "@/types/resume";
import { Button, showToast } from "@/components/ui";
import { EmptyState } from "@/components/common";
import { useResumeStore } from "@/stores/resumeStore";
import { runKnowledgeAgent } from "@/services/resume/agents/knowledgeAgent";
import {
  deleteResumeKnowledgeRuns,
  getResumeKnowledgePromptConfig,
  getResumeKnowledgeRuns,
  readResumeKnowledgeRunArtifact,
  type AgentEvent,
  type AgentRunRecord,
  type AgentRunState,
  type ArtifactRef,
  type ResumeAgentPromptConfig,
} from "@/services/resume/knowledgeStore";

interface KnowledgePanelProps {
  selectedProjects: Project[];
  provider: AiProviderConfig | null;
  promptConfigVersion?: number;
  onNext?: () => void;
}

type KnowledgeView = "background" | "runs";
type RunDetailView = "overview" | "trace";
type RunEventFilter = "all" | "model" | "tool" | "error";

const VIEWS: Array<{ key: KnowledgeView; label: string; icon: typeof FileText }> = [
  { key: "background", label: "背景知识", icon: FileText },
  { key: "runs", label: "生成过程", icon: History },
];

export function KnowledgePanel({ selectedProjects, provider, promptConfigVersion = 0, onNext }: KnowledgePanelProps) {
  const {
    knowledgeDocs,
    upsertKnowledge,
    removeKnowledge,
    knowledgeRuns,
    startKnowledgeRun,
    setKnowledgeRunSnapshot,
    finishKnowledgeRun,
    clearKnowledgeRun,
  } = useResumeStore();
  const [activeProjectId, setActiveProjectId] = useState(selectedProjects[0]?.id ?? "");
  const [activeView, setActiveView] = useState<KnowledgeView>("background");
  const [runState, setRunState] = useState<AgentRunState | null>(null);
  const [runDetailView, setRunDetailView] = useState<RunDetailView>("overview");
  const [promptConfig, setPromptConfig] = useState<ResumeAgentPromptConfig | null>(null);
  const [artifactContent, setArtifactContent] = useState<Record<string, string>>({});
  const [activeArtifact, setActiveArtifact] = useState<{ artifact: ArtifactRef; content: string } | null>(null);
  const [artifactLoadingId, setArtifactLoadingId] = useState<string | null>(null);

  const activeProject = selectedProjects.find((item) => item.id === activeProjectId) ?? selectedProjects[0] ?? null;
  const activeDoc = activeProject ? knowledgeDocs[activeProject.id] : undefined;
  const liveRun = activeProject ? knowledgeRuns[activeProject.id]?.run : undefined;
  const running = activeProject ? knowledgeRuns[activeProject.id]?.status === "running" : false;
  const storedRun = runState?.current?.projectId === activeProject?.id ? runState.current : null;
  const selectedRun = liveRun ?? storedRun;
  const stats = useMemo(() => summarizeRun(selectedRun), [selectedRun]);
  const showProjectRail = selectedProjects.length > 1;

  useEffect(() => {
    if (!selectedProjects.find((item) => item.id === activeProjectId)) {
      setActiveProjectId(selectedProjects[0]?.id ?? "");
    }
  }, [selectedProjects, activeProjectId]);

  useEffect(() => {
    void getResumeKnowledgePromptConfig()
      .then(setPromptConfig)
      .catch((err) => showToast("error", `读取提示词失败: ${err instanceof Error ? err.message : String(err)}`));
  }, [promptConfigVersion]);

  useEffect(() => {
    setRunState(null);
    setArtifactContent({});
    setActiveArtifact(null);
    if (!activeProject) return;
    void refreshRuns(activeProject.id);
  }, [activeProject?.id]);

  async function refreshRuns(projectId: string) {
    try {
      setRunState(await getResumeKnowledgeRuns(projectId));
    } catch (err) {
      showToast("error", `读取生成记录失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleGenerate(project: Project) {
    if (!provider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    await deleteResumeKnowledgeRuns(project.id).catch(() => undefined);
    clearKnowledgeRun(project.id);
    setRunState(null);
    setArtifactContent({});
    setActiveArtifact(null);
    const requestId = generateRequestId();
    setActiveProjectId(project.id);
    setActiveView("runs");
    startKnowledgeRun(project.id, requestId);
    try {
      const result = await runKnowledgeAgent({
        requestId,
        projectId: project.id,
        provider,
        promptConfig: promptConfig ?? undefined,
        onRun: (run) => setKnowledgeRunSnapshot(project.id, run),
      });
      const doc: ProjectKnowledge = {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        content: result.background,
        updatedAt: new Date().toISOString(),
        userEdited: false,
      };
      await upsertKnowledge(doc, false);
      finishKnowledgeRun(project.id);
      await refreshRuns(project.id);
      showToast("success", `${project.name} 已生成`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finishKnowledgeRun(project.id, msg);
      await refreshRuns(project.id);
      showToast("error", `${project.name} 生成失败: ${msg}`);
    }
  }

  async function handleDelete(projectId: string) {
    clearKnowledgeRun(projectId);
    setRunState(null);
    setArtifactContent({});
    setActiveArtifact(null);
    await removeKnowledge(projectId);
  }

  async function openArtifact(run: AgentRunRecord, artifact: ArtifactRef) {
    const cached = artifactContent[artifact.id];
    setActiveArtifact({ artifact, content: cached ?? "" });
    if (cached) return;
    setArtifactLoadingId(artifact.id);
    try {
      const result = await readResumeKnowledgeRunArtifact(run.projectId, artifact.id);
      setArtifactContent((prev) => ({ ...prev, [artifact.id]: result.content }));
      setActiveArtifact((current) => current?.artifact.id === artifact.id
        ? { artifact, content: result.content }
        : current);
    } catch (err) {
      showToast("error", `读取原始内容失败: ${err instanceof Error ? err.message : String(err)}`);
      setActiveArtifact(null);
    } finally {
      setArtifactLoadingId(null);
    }
  }

  async function openRuntimePrompt(run: AgentRunRecord, promptArtifact?: ArtifactRef, rawArtifact?: ArtifactRef) {
    if (promptArtifact) {
      await openArtifact(run, promptArtifact);
      return;
    }
    if (!rawArtifact) {
      showToast("warning", "当前记录未包含运行时提示词，请重新生成一次");
      return;
    }
    const cached = artifactContent[rawArtifact.id];
    const syntheticId = `runtime-prompt-${rawArtifact.id}`;
    setArtifactLoadingId(syntheticId);
    setActiveArtifact({
      artifact: {
        id: syntheticId,
        label: "运行时提示词",
        kind: "llm_full_prompt_fallback",
        chars: 0,
      },
      content: "",
    });
    try {
      const rawContent = cached ?? (await readResumeKnowledgeRunArtifact(run.projectId, rawArtifact.id)).content;
      if (!cached) setArtifactContent((prev) => ({ ...prev, [rawArtifact.id]: rawContent }));
      const promptContent = formatRuntimePromptFromRawJson(rawContent);
      setActiveArtifact({
        artifact: {
          id: syntheticId,
          label: "运行时提示词",
          kind: "llm_full_prompt_fallback",
          chars: [...promptContent].length,
        },
        content: promptContent,
      });
    } catch (err) {
      showToast("error", `读取运行时提示词失败: ${err instanceof Error ? err.message : String(err)}`);
      setActiveArtifact(null);
    } finally {
      setArtifactLoadingId(null);
    }
  }

  if (selectedProjects.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <EmptyState icon={FileText} title="未选择项目" description="请先选择需要生成简历材料的项目。" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-white">
      <div className="h-full overflow-auto px-6 pb-5">
        <div className={`mx-auto grid min-h-full max-w-6xl gap-4 ${showProjectRail ? "grid-cols-[260px_minmax(0,1fr)]" : "grid-cols-1"}`}>
          {showProjectRail && (
            <ProjectRail
              projects={selectedProjects}
              activeProjectId={activeProject?.id ?? ""}
              knowledgeDocs={knowledgeDocs}
              knowledgeRuns={knowledgeRuns}
              onSelect={(id) => setActiveProjectId(id)}
            />
          )}

          <section className="min-w-0 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-emerald-900/5">
            <PanelHeader
              project={activeProject}
              provider={provider}
              running={running}
              activeView={activeView}
              stats={stats}
              canDelete={!!activeProject && !!activeDoc}
              onViewChange={setActiveView}
              onGenerate={() => activeProject && handleGenerate(activeProject)}
              onNext={onNext}
              onDelete={() => activeProject && handleDelete(activeProject.id)}
              onRefresh={() => activeProject && refreshRuns(activeProject.id)}
            />

            <div className="min-h-[560px] p-4">
              {activeView === "background" && (
                <BackgroundView activeDoc={activeDoc} />
              )}

              {activeView === "runs" && (
                selectedRun ? (
                  <RunProcessView
                    run={selectedRun}
                    view={runDetailView}
                    onViewChange={setRunDetailView}
                    onOpenArtifact={openArtifact}
                    onOpenRuntimePrompt={openRuntimePrompt}
                  />
                ) : (
                  <EmptyState icon={Bot} title="暂无生成记录" description="开始生成后，会在这里完整记录模型调用和工具调用。" />
                )
              )}

            </div>
          </section>
        </div>
      </div>
      {activeArtifact && (
        <ArtifactModal
          artifact={activeArtifact.artifact}
          content={activeArtifact.content}
          loading={artifactLoadingId === activeArtifact.artifact.id}
          onClose={() => setActiveArtifact(null)}
        />
      )}
    </div>
  );
}

function PanelHeader({
  project,
  provider,
  running,
  activeView,
  stats,
  canDelete,
  onViewChange,
  onGenerate,
  onNext,
  onDelete,
  onRefresh,
}: {
  project: Project | null;
  provider: AiProviderConfig | null;
  running: boolean;
  activeView: KnowledgeView;
  stats: ReturnType<typeof summarizeRun>;
  canDelete: boolean;
  onViewChange: (view: KnowledgeView) => void;
  onGenerate: () => void;
  onNext?: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const modelName = provider?.models.find((item) => item.isDefault)?.model ?? provider?.models[0]?.model ?? "-";

  return (
    <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-emerald-600" />
            <h2 className="truncate text-base font-semibold text-emerald-950">{project?.name ?? "背景知识"}</h2>
          </div>
          <div className="mt-1 truncate text-xs text-gray-500">{project?.path}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-emerald-800/80">
            <Bot size={13} />
            <span className="truncate">{provider ? `${provider.name} / ${modelName}` : "未配置 AI 供应商"}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onNext} className="gap-1.5">
            下一步
            <ChevronRight size={14} />
          </Button>
          <Button size="sm" onClick={onGenerate} disabled={!project || running || !provider} className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-500">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            生成背景知识
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <ViewTabs active={activeView} onChange={onViewChange} />
        {activeView === "background" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={!canDelete}
            className="gap-1.5 text-gray-500 hover:text-red-600"
          >
            <Trash2 size={14} />
            删除
          </Button>
        ) : activeView === "runs" ? (
          <RunToolbar
            stats={stats}
            onRefresh={onRefresh}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProjectRail({
  projects,
  activeProjectId,
  knowledgeDocs,
  knowledgeRuns,
  onSelect,
}: {
  projects: Project[];
  activeProjectId: string;
  knowledgeDocs: Record<string, ProjectKnowledge>;
  knowledgeRuns: ReturnType<typeof useResumeStore.getState>["knowledgeRuns"];
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="min-h-0 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-emerald-900/5">
      <div className="border-b border-emerald-100 bg-emerald-50/70 px-3 py-3">
        <div className="text-sm font-medium text-emerald-950">已选项目</div>
        <div className="mt-0.5 text-xs text-gray-500">{projects.length} 个项目</div>
      </div>
      <div className="max-h-[680px] overflow-auto p-2">
        {projects.map((project) => {
          const active = project.id === activeProjectId;
          const hasDoc = !!knowledgeDocs[project.id];
          const projectRunning = knowledgeRuns[project.id]?.status === "running";
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelect(project.id)}
              className={`mb-2 w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active ? "border-emerald-300 bg-emerald-50" : "border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-gray-900">{project.name}</span>
                {projectRunning ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-emerald-600" />
                ) : hasDoc ? (
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                ) : null}
              </div>
              <div className="mt-1 truncate text-xs text-gray-500">{project.path}</div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ViewTabs({ active, onChange }: { active: KnowledgeView; onChange: (view: KnowledgeView) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-white p-1 shadow-sm shadow-emerald-900/5">
      {VIEWS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${
              active === item.key ? "bg-emerald-500 text-white" : "text-gray-600 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            <Icon size={15} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function BackgroundView({ activeDoc }: { activeDoc?: ProjectKnowledge }) {
  if (!activeDoc) {
    return (
      <EmptyState icon={FileText} title="暂无背景知识" description="点击生成后，Deep Agent 会自主调查项目并生成背景知识。" />
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        <span>{activeDoc.projectName}</span>
        <span>{new Date(activeDoc.updatedAt).toLocaleString("zh-CN")}</span>
      </div>
      <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap bg-white p-4 text-sm leading-6 text-gray-800">
        {activeDoc.content}
      </pre>
    </div>
  );
}

function RunToolbar({
  stats,
  onRefresh,
}: {
  stats: ReturnType<typeof summarizeRun>;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-3 text-xs text-gray-500 md:flex">
        <span>模型 {stats.model}</span>
        <span>工具 {stats.tool}</span>
        <span>错误 {stats.error}</span>
      </div>
      <Button size="sm" variant="ghost" onClick={onRefresh}>
        <RefreshCw size={15} />
      </Button>
    </div>
  );
}

function RunProcessView({
  run,
  view,
  onViewChange,
  onOpenArtifact,
  onOpenRuntimePrompt,
}: {
  run: AgentRunRecord;
  view: RunDetailView;
  onViewChange: (view: RunDetailView) => void;
  onOpenArtifact: (run: AgentRunRecord, artifact: ArtifactRef) => void;
  onOpenRuntimePrompt: (run: AgentRunRecord, promptArtifact?: ArtifactRef, rawArtifact?: ArtifactRef) => void;
}) {
  const [filter, setFilter] = useState<RunEventFilter>("all");
  const stats = summarizeRun(run);
  const fullPromptArtifact = findRunArtifact(run, "llm_full_prompt");
  const rawPromptSourceArtifact = findRunArtifact(run, "llm_raw_json") ?? findRunArtifact(run, "llm_request_json");
  const toolsArtifact = findRunArtifact(run, "llm_tools_manifest");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge>flow_id: {run.requestId}</Badge>
            <Badge tone={run.status === "error" ? "danger" : run.status === "running" ? "info" : "success"}>{run.status}</Badge>
            <Badge>节点: {run.events.length}</Badge>
            <Badge>模型: {stats.model}</Badge>
            <Badge>工具: {stats.tool}</Badge>
            <Badge>总耗时: {typeof run.durationMs === "number" ? formatDuration(run.durationMs) : "-"}</Badge>
            {stats.totalTokens ? <Badge tone="success">tokens: {formatNumber(stats.totalTokens)}</Badge> : null}
            {stats.error ? <Badge tone="danger">错误: {stats.error}</Badge> : null}
          </div>
          <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
            开始: {run.startedAt}
            {run.finishedAt ? ` | 结束: ${run.finishedAt}` : ""}
            {stats.inputTokens ? ` | input: ${formatNumber(stats.inputTokens)}` : ""}
            {stats.outputTokens ? ` / output: ${formatNumber(stats.outputTokens)}` : ""}
            {stats.cacheReadTokens ? ` / cache read: ${formatNumber(stats.cacheReadTokens)}` : ""}
            {stats.reasoningTokens ? ` / reasoning: ${formatNumber(stats.reasoningTokens)}` : ""}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenRuntimePrompt(run, fullPromptArtifact, rawPromptSourceArtifact)}
              disabled={!fullPromptArtifact && !rawPromptSourceArtifact}
              title={fullPromptArtifact || rawPromptSourceArtifact ? "查看本次模型实际收到的完整运行时提示词" : "当前记录未包含运行时提示词，请重新生成一次"}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fullPromptArtifact || rawPromptSourceArtifact ? "运行时提示词" : "运行时提示词（未记录）"}
            </button>
            <button
              type="button"
              onClick={() => toolsArtifact && onOpenArtifact(run, toolsArtifact)}
              disabled={!toolsArtifact}
              title={toolsArtifact ? "查看本次运行暴露给模型的完整工具清单" : "当前记录未包含工具清单，请重新生成一次"}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {toolsArtifact ? "工具清单" : "工具清单（未记录）"}
            </button>
            {!fullPromptArtifact && !rawPromptSourceArtifact && (
              <span className="text-xs text-gray-400">旧记录可能没有该 artifact，重新生成后会写入。</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>全部 {run.events.length}</FilterChip>
            <FilterChip active={filter === "model"} onClick={() => setFilter("model")}>模型 {stats.model}</FilterChip>
            <FilterChip active={filter === "tool"} onClick={() => setFilter("tool")}>工具 {stats.tool}</FilterChip>
            <FilterChip active={filter === "error"} onClick={() => setFilter("error")}>错误 {stats.error}</FilterChip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-gray-100 p-0.5">
              <button
                type="button"
                className={`rounded px-3 py-1 text-xs ${view === "overview" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"}`}
                onClick={() => onViewChange("overview")}
              >
                概览
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1 text-xs ${view === "trace" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"}`}
                onClick={() => onViewChange("trace")}
              >
                完整 Trace
              </button>
            </div>
          </div>
        </div>
      </div>

      {view === "overview" ? (
        <RunOverview
          run={run}
          filter={filter}
          onOpenArtifact={onOpenArtifact}
        />
      ) : (
        <RunTrace
          run={run}
          filter={filter}
          onOpenArtifact={onOpenArtifact}
        />
      )}
    </div>
  );
}

function RunOverview({
  run,
  filter,
  onOpenArtifact,
}: {
  run: AgentRunRecord;
  filter: RunEventFilter;
  onOpenArtifact: (run: AgentRunRecord, artifact: ArtifactRef) => void;
}) {
  const modelEvents = run.events.filter((event) => event.type === "model_call");
  const toolEvents = run.events.filter((event) => event.type === "tool_call" || event.type === "finalize");
  const errorEvents = run.events.filter((event) => event.status === "error" || event.type === "error");
  const toolAggregate = buildToolAggregate(run);
  return (
    <div className="space-y-3">
      {(filter === "all" || filter === "model") && (
        <OverviewSection title="模型交互" icon={Bot} events={modelEvents} run={run} onOpenArtifact={onOpenArtifact} />
      )}
      {filter === "tool" ? (
        <ToolAggregateOverview tools={toolAggregate} />
      ) : filter === "all" ? (
        <OverviewSection title="工具调用" icon={TerminalSquare} events={toolEvents} run={run} onOpenArtifact={onOpenArtifact} />
      ) : null}
      {filter === "error" && (
        <OverviewSection title="错误事件" icon={AlertCircle} events={errorEvents} run={run} onOpenArtifact={onOpenArtifact} />
      )}
    </div>
  );
}

function RunTrace({
  run,
  filter,
  onOpenArtifact,
}: {
  run: AgentRunRecord;
  filter: RunEventFilter;
  onOpenArtifact: (run: AgentRunRecord, artifact: ArtifactRef) => void;
}) {
  const events = orderedEvents(run.events).filter((event) => eventMatchesFilter(event, filter));
  return (
    <div className="space-y-2">
      {events.length === 0 && (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-500">没有匹配的事件</div>
      )}
      {events.map((event, index) => (
        <TraceEventCard
          key={event.id}
          run={run}
          event={event}
          index={index}
          next={events[index + 1]}
          onOpenArtifact={onOpenArtifact}
        />
      ))}
    </div>
  );
}

function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "danger" | "info" }) {
  const cls = tone === "success"
    ? "border-green-200 bg-green-50 text-green-700"
    : tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "info"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-gray-200 bg-gray-50 text-gray-700";
  return <span className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${cls}`}>{children}</span>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
        active ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function OverviewSection({
  title,
  icon: Icon,
  events,
  run,
  onOpenArtifact,
}: {
  title: string;
  icon: typeof FileText;
  events: AgentEvent[];
  run: AgentRunRecord;
  onOpenArtifact: (run: AgentRunRecord, artifact: ArtifactRef) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
        <Icon size={15} />
        {title}
        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-500 ring-1 ring-gray-200">{events.length}</span>
      </div>
      <div className="space-y-2 p-2">
        {events.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-500">暂无记录</div>
        ) : events.map((event) => (
          <OverviewEventRow
            key={event.id}
            run={run}
            event={event}
            onOpenArtifact={onOpenArtifact}
          />
        ))}
      </div>
    </section>
  );
}

function ToolAggregateOverview({ tools }: { tools: ToolAggregateItem[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
        <TerminalSquare size={15} />
        工具概览
        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-500 ring-1 ring-gray-200">{tools.length}</span>
      </div>
      <div className="space-y-2 p-2">
        {tools.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-500">暂无工具调用</div>
        ) : tools.map((tool) => (
          <details key={tool.name} className="group rounded-md border border-gray-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-gray-900">{tool.name}</span>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">调用 {tool.count}</span>
                </div>
                {tool.lastPreview && <div className="mt-1 truncate text-xs text-gray-500">{tool.lastPreview}</div>}
              </div>
              <ChevronRight size={15} className="shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-gray-100 px-3 py-2">
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-700">
                {tool.description || "无工具描述"}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function OverviewEventRow({
  run,
  event,
  onOpenArtifact,
}: {
  run: AgentRunRecord;
  event: AgentEvent;
  onOpenArtifact: (run: AgentRunRecord, artifact: ArtifactRef) => void;
}) {
  return (
    <details className="group rounded-md border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-3 py-2 hover:bg-gray-50">
        <div className="flex items-start justify-between gap-3">
          <EventHeader event={event} />
          <ChevronRight size={15} className="mt-1 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
        </div>
      </summary>
      <div className="border-t border-gray-100 px-3 py-3">
        <EventBody event={event} compact />
      </div>
      <EventArtifacts
        run={run}
        event={event}
        onOpenArtifact={onOpenArtifact}
      />
    </details>
  );
}

function TraceEventCard({
  run,
  event,
  index,
  next,
  onOpenArtifact,
}: {
  run: AgentRunRecord;
  event: AgentEvent;
  index: number;
  next?: AgentEvent;
  onOpenArtifact: (run: AgentRunRecord, artifact: ArtifactRef) => void;
}) {
  return (
    <details className="group rounded-md border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-3 py-3 hover:bg-gray-50">
        <div className="flex items-start justify-between gap-3">
          <EventHeader event={event} index={index} />
          <ChevronRight size={15} className="mt-1 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
        </div>
      </summary>
      <div className="border-t border-gray-100 px-3 py-3">
        <EventBody event={event} />
        <div className="mt-2 text-xs text-gray-500">
          下一步: {next ? `${eventTypeLabel(next)} / ${next.toolName ?? next.title ?? next.id}` : "结束"}
        </div>
      </div>
      {event.error && <div className="border-t border-gray-100 px-3 py-2 text-xs text-red-600">{event.error}</div>}
      <EventArtifacts
        run={run}
        event={event}
        onOpenArtifact={onOpenArtifact}
      />
    </details>
  );
}

function EventHeader({ event, index }: { event: AgentEvent; index?: number }) {
  const Icon = event.type === "model_call" ? Bot : event.type === "tool_call" ? TerminalSquare : event.status === "error" ? AlertCircle : Braces;
  const tokens = getEventTokens(event);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {typeof index === "number" && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">#{index + 1}</span>}
        <Icon size={15} className={event.status === "error" ? "text-red-600" : "text-gray-500"} />
        <span className="font-mono text-xs text-gray-500">[{eventTypeLabel(event)}]</span>
        <span className="font-medium text-gray-900">{event.toolName ?? event.title ?? event.id}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${statusClass(event.status)}`}>{event.status}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
        <span>{event.startedAt ?? event.at}</span>
        {typeof event.durationMs === "number" && <span>{formatDuration(event.durationMs)}</span>}
        {typeof event.returnedChars === "number" && <span>{event.returnedChars} chars</span>}
        {tokens.total ? <span>tokens {formatNumber(tokens.total)}</span> : null}
        {tokens.input ? <span>in {formatNumber(tokens.input)}</span> : null}
        {tokens.output ? <span>out {formatNumber(tokens.output)}</span> : null}
        {event.blockedBy ? <span>{event.blockedBy}</span> : null}
      </div>
    </div>
  );
}

function EventBody({ event, compact = false }: { event: AgentEvent; compact?: boolean }) {
  if (event.type === "model_call") return <ModelEventBody event={event} compact={compact} />;
  if (event.type === "tool_call" || event.type === "finalize") return <ToolEventBody event={event} compact={compact} />;
  if (!event.data) return null;
  return <SummaryJson data={event.data} />;
}

function ModelEventBody({ event, compact }: { event: AgentEvent; compact: boolean }) {
  const data = event.data ?? {};
  const finishReason = getString(data.finishReason);
  const runId = getString(data.modelRunId);
  const langgraphNode = getString(data.langgraphNode);
  const text = getString(data.text);
  const reasoning = getString(data.reasoning);
  const toolCalls = getToolCalls(data.toolCalls);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        {runId && <InfoPill label="runId" value={shortId(runId)} />}
        {finishReason && <InfoPill label="finish" value={finishReason} />}
        {langgraphNode && <InfoPill label="node" value={langgraphNode} />}
        <InfoPill label="tool_calls" value={String(toolCalls.length)} />
      </div>
      {text ? (
        <TextBlock title="模型文本回复" text={text} compact={compact} />
      ) : toolCalls.length > 0 ? (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          这一步没有普通文本回复，模型以 tool_calls 结束，表示它选择调用下面的工具。
        </div>
      ) : null}
      {reasoning && <TextBlock title="模型思考" text={reasoning} compact={compact} tone="amber" />}
      {toolCalls.length > 0 && <ToolCallList calls={toolCalls} />}
    </div>
  );
}

function ToolEventBody({ event, compact }: { event: AgentEvent; compact: boolean }) {
  const data = event.data ?? {};
  const input = asRecord(data.input);
  const argsPreview = getString(input?.argsPreview);
  const todos = getTodos(input?.todos);
  const outputPreview = getString(data.outputPreview);
  const exitCode = getNumber(data.exitCode);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <InfoPill label="tool" value={event.toolName ?? event.title ?? event.id} />
        {typeof event.durationMs === "number" && <InfoPill label="耗时" value={formatDuration(event.durationMs)} />}
        {typeof exitCode === "number" && <InfoPill label="exitCode" value={String(exitCode)} />}
      </div>
      {argsPreview && <TextBlock title="入参摘要" text={argsPreview} compact />}
      {todos.length > 0 && <TodoPreview todos={todos} />}
      {event.error && <TextBlock title="错误" text={event.error} compact tone="amber" />}
      {outputPreview && <TextBlock title="返回摘要" text={outputPreview} compact={compact} />}
    </div>
  );
}

function ToolCallList({ calls }: { calls: ToolCallView[] }) {
  return (
    <div className="space-y-2">
      {calls.map((call, index) => (
        <div key={`${call.id ?? call.name}-${index}`} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-gray-900">{call.name}</span>
            {call.id && <span className="font-mono text-gray-500">{shortId(call.id)}</span>}
            {call.argsPreview && <span className="text-gray-500">{call.argsPreview}</span>}
          </div>
          {call.todos.length > 0 && <TodoPreview todos={call.todos} />}
        </div>
      ))}
    </div>
  );
}

function TodoPreview({ todos }: { todos: TodoItemView[] }) {
  return (
    <div className="mt-2 space-y-1">
      {todos.map((todo, index) => (
        <div key={`${todo.content}-${index}`} className="flex items-start gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs">
          <ListChecks size={13} className="mt-0.5 shrink-0 text-gray-500" />
          <span className={`shrink-0 rounded px-1.5 py-0.5 ${todoStatusClass(todo.status)}`}>{todo.status || "pending"}</span>
          <span className="text-gray-700">{todo.content || "-"}</span>
        </div>
      ))}
    </div>
  );
}

function TextBlock({ title, text, compact, tone = "default" }: { title: string; text: string; compact: boolean; tone?: "default" | "amber" }) {
  const cls = tone === "amber" ? "border-amber-100 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-800";
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <div className="mb-1 text-xs font-medium">{title}</div>
      <pre className={`${compact ? "max-h-24" : "max-h-52"} overflow-auto whitespace-pre-wrap text-xs leading-5`}>{text}</pre>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-gray-200 bg-white px-2 py-1 text-gray-600">
      <span className="text-gray-400">{label}: </span>{value}
    </span>
  );
}

function SummaryJson({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function EventArtifacts({
  run,
  event,
  onOpenArtifact,
}: {
  run: AgentRunRecord;
  event: AgentEvent;
  onOpenArtifact: (run: AgentRunRecord, artifact: ArtifactRef) => void;
}) {
  if (!event.artifacts || event.artifacts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-100 px-3 py-2">
      {event.artifacts.map((artifact) => (
        <button
          key={artifact.id}
          type="button"
          onClick={() => onOpenArtifact(run, artifact)}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          <FileJson size={13} />
          {artifact.label}
          <span className="text-gray-400">{artifact.chars} chars</span>
        </button>
      ))}
    </div>
  );
}

function ArtifactModal({
  artifact,
  content,
  loading,
  onClose,
}: {
  artifact: ArtifactRef;
  content: string;
  loading: boolean;
  onClose: () => void;
}) {
  const formatted = formatArtifactContent(content);
  async function copyContent() {
    try {
      await navigator.clipboard.writeText(content);
      showToast("success", "已复制");
    } catch (err) {
      showToast("error", `复制失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <FileJson size={16} className="text-gray-500" />
              {artifact.label}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
              <span>{artifact.kind}</span>
              <span>{artifact.chars} chars</span>
              <span className="font-mono">{artifact.id}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" onClick={copyContent} disabled={loading || !content} className="gap-1.5">
              <Copy size={14} />
              复制
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex h-72 items-center justify-center text-sm text-gray-500">
            <Loader2 size={18} className="mr-2 animate-spin" />
            读取中...
          </div>
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto bg-gray-950 p-4 text-xs leading-5 text-gray-100">
            {formatted}
          </pre>
        )}
      </div>
    </div>
  );
}

interface EventTokenSummary {
  input?: number;
  output?: number;
  total?: number;
  cacheRead?: number;
  reasoning?: number;
}

interface TodoItemView {
  content?: string;
  status?: string;
}

interface ToolCallView {
  id?: string;
  name: string;
  argsPreview?: string;
  todos: TodoItemView[];
}

interface ToolAggregateItem {
  name: string;
  description: string;
  count: number;
  lastPreview?: string;
}

function summarizeRun(run: AgentRunRecord | null) {
  const events = run?.events ?? [];
  const tokenTotals = events.reduce(
    (acc, event) => {
      const tokens = getEventTokens(event);
      acc.input += tokens.input ?? 0;
      acc.output += tokens.output ?? 0;
      acc.total += tokens.total ?? 0;
      acc.cacheRead += tokens.cacheRead ?? 0;
      acc.reasoning += tokens.reasoning ?? 0;
      return acc;
    },
    { input: 0, output: 0, total: 0, cacheRead: 0, reasoning: 0 },
  );
  return {
    model: events.filter((event) => event.type === "model_call").length,
    tool: events.filter((event) => event.type === "tool_call" || event.type === "finalize").length,
    blocked: events.filter((event) => event.blocked || event.status === "blocked").length,
    error: events.filter((event) => event.type === "error" || event.status === "error").length,
    inputTokens: tokenTotals.input,
    outputTokens: tokenTotals.output,
    totalTokens: tokenTotals.total,
    cacheReadTokens: tokenTotals.cacheRead,
    reasoningTokens: tokenTotals.reasoning,
  };
}

function eventMatchesFilter(event: AgentEvent, filter: RunEventFilter): boolean {
  if (filter === "all") return true;
  if (filter === "model") return event.type === "model_call";
  if (filter === "tool") return event.type === "tool_call" || event.type === "finalize";
  return event.type === "error" || event.status === "error";
}

function findRunArtifact(run: AgentRunRecord, kind: string): ArtifactRef | undefined {
  for (const event of run.events) {
    const artifact = event.artifacts?.find((item) => item.kind === kind);
    if (artifact) return artifact;
  }
  return undefined;
}

function buildToolAggregate(run: AgentRunRecord): ToolAggregateItem[] {
  const descriptions = new Map<string, string>();
  for (const tool of getRuntimeToolDefinitions(run)) {
    descriptions.set(tool.name, tool.description);
  }
  const byName = new Map<string, ToolAggregateItem>();
  for (const event of run.events) {
    if (event.type !== "tool_call" && event.type !== "finalize") continue;
    const name = event.toolName ?? event.title ?? event.id;
    const current = byName.get(name) ?? {
      name,
      description: descriptions.get(name) ?? "",
      count: 0,
      lastPreview: undefined,
    };
    current.count += 1;
    current.lastPreview = getToolEventPreview(event) || current.lastPreview;
    byName.set(name, current);
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function getRuntimeToolDefinitions(run: AgentRunRecord): Array<{ name: string; description: string }> {
  const contextEvent = run.events.find((event) => event.title === "agent_context");
  const tools = contextEvent?.data?.tools;
  if (!Array.isArray(tools)) return [];
  const result: Array<{ name: string; description: string }> = [];
  for (const item of tools) {
    const object = asRecord(item);
    const name = getString(object?.name);
    if (!name) continue;
    result.push({
      name,
      description: getString(object?.description),
    });
  }
  return result;
}

function getToolEventPreview(event: AgentEvent): string {
  const data = event.data ?? {};
  const input = asRecord(data.input);
  return getString(input?.argsPreview) || getString(data.outputPreview);
}

function getEventTokens(event: AgentEvent): EventTokenSummary {
  const data = event.data ?? {};
  const tokens = asRecord(data.tokens);
  const usage = asRecord(data.usage);
  return {
    input: getNumber(tokens?.input) ?? getNumber(usage?.input_tokens) ?? getNumber(usage?.prompt_tokens) ?? getNumber(usage?.promptTokens),
    output: getNumber(tokens?.output) ?? getNumber(usage?.output_tokens) ?? getNumber(usage?.completion_tokens) ?? getNumber(usage?.completionTokens),
    total: getNumber(tokens?.total) ?? getNumber(usage?.total_tokens) ?? getNumber(usage?.totalTokens),
    cacheRead: getNumber(tokens?.cacheRead)
      ?? getNumber(asRecord(usage?.input_token_details)?.cache_read)
      ?? getNumber(asRecord(usage?.prompt_tokens_details)?.cached_tokens)
      ?? getNumber(usage?.prompt_cache_hit_tokens),
    reasoning: getNumber(tokens?.reasoning)
      ?? getNumber(asRecord(usage?.output_token_details)?.reasoning)
      ?? getNumber(asRecord(usage?.completion_tokens_details)?.reasoning_tokens),
  };
}

function getToolCalls(value: unknown): ToolCallView[] {
  if (!Array.isArray(value)) return [];
  const result: ToolCallView[] = [];
  for (const item of value) {
    const object = asRecord(item);
    if (!object) continue;
    const name = getString(object.name);
    if (!name) continue;
    result.push({
      id: getString(object.id) || undefined,
      name,
      argsPreview: getString(object.argsPreview) || undefined,
      todos: getTodos(object.todos),
    });
  }
  return result;
}

function getTodos(value: unknown): TodoItemView[] {
  if (!Array.isArray(value)) return [];
  const result: TodoItemView[] = [];
  for (const item of value) {
    const object = asRecord(item);
    if (!object) continue;
    result.push({
      content: getString(object.content) || undefined,
      status: getString(object.status) || undefined,
    });
  }
  return result;
}

function formatArtifactContent(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function formatRuntimePromptFromRawJson(content: string): string {
  const parsed = JSON.parse(content);
  const messages = getPath(parsed, ["request", "messages"]) ?? getPath(parsed, ["messages"]);
  if (!messages) throw new Error("artifact 中没有 request.messages");
  return formatRuntimePromptMessages(messages);
}

function formatRuntimePromptMessages(messages: unknown): string {
  const groups = Array.isArray(messages) ? messages : [messages];
  const sections: string[] = [];
  let index = 0;
  for (const group of groups) {
    const items = Array.isArray(group) ? group : [group];
    for (const item of items) {
      index += 1;
      const object = asRecord(item);
      const kwargs = asRecord(object?.kwargs);
      const type = getString(kwargs?.type) || getString(object?.type) || `message_${index}`;
      const content = firstText(
        messageContentToText(kwargs?.content),
        messageContentToText(getPath(kwargs, ["lc_kwargs", "content"])),
        messageContentToText(object?.content),
      );
      sections.push([`## ${index}. ${type}`, "", content || JSON.stringify(item, null, 2)].join("\n"));
    }
  }
  return sections.join("\n\n---\n\n");
}

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      const object = asRecord(item);
      return getString(object?.text);
    })
    .filter(Boolean)
    .join("\n");
}

function firstText(...values: string[]): string {
  return values.find((value) => value.trim()) ?? "";
}

function getPath(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
      continue;
    }
    const object = asRecord(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes}m ${rest}s`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function eventTypeLabel(event: AgentEvent): string {
  if (event.type === "model_call") return "MODEL";
  if (event.type === "tool_call") return "TOOL";
  if (event.type === "finalize") return "FINAL";
  if (event.type === "system") return "SYSTEM";
  return event.type.toUpperCase();
}

function todoStatusClass(status?: string): string {
  if (status === "completed") return "bg-green-50 text-green-700";
  if (status === "in_progress") return "bg-blue-50 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function orderedEvents(events: AgentEvent[]): AgentEvent[] {
  return [...events].sort((a, b) => {
    const aTime = Date.parse(a.startedAt ?? a.at);
    const bTime = Date.parse(b.startedAt ?? b.at);
    if (Number.isNaN(aTime) || Number.isNaN(bTime) || aTime === bTime) return 0;
    return aTime - bTime;
  });
}

function statusClass(status: string): string {
  switch (status) {
    case "success":
      return "bg-green-50 text-green-700";
    case "error":
      return "bg-red-50 text-red-700";
    case "blocked":
      return "bg-amber-50 text-amber-700";
    case "running":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
