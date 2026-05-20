import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Edit3,
  History,
  Eye,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Wand2,
  XCircle,
  Ban,
  PencilLine,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Project, AiProviderConfig } from "@/types";
import type { ProjectKnowledge } from "@/types/resume";
import { useResumeStore } from "@/stores/resumeStore";
import { runKnowledgeAgent } from "@/services/resume/agents/knowledgeAgent";
import type { AgentStep } from "@/services/resume/agents/resumeAgent";
import {
  listResumeKnowledgeHistory,
  readResumeKnowledgeHistory,
} from "@/services/resume/knowledgeStore";
import type {
  ResumeKnowledgeHistoryEntry,
  KnowledgeRunMeta,
  QualityIssue,
} from "@/services/resume/knowledgeStore";
import { Button, showToast } from "@/components/ui";
import { EmptyState } from "@/components/common";

interface KnowledgePanelProps {
  selectedProjects: Project[];
  provider: AiProviderConfig | null;
  onNext?: () => void;
}

export function KnowledgePanel({ selectedProjects, provider, onNext }: KnowledgePanelProps) {
  const {
    knowledgeDocs,
    upsertKnowledge,
    removeKnowledge,
    setKnowledgeInMemory,
    knowledgeRuns,
    startKnowledgeRun,
    appendKnowledgeStep,
    finishKnowledgeRun,
  } = useResumeStore();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    selectedProjects[0]?.id ?? null
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [history, setHistory] = useState<ResumeKnowledgeHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** 当前在历史列表里被展开看详情的 timestamp(null=折叠所有) */
  const [expandedTs, setExpandedTs] = useState<string | null>(null);
  /** 展开行对应的完整 meta(从 read_resume_knowledge_history 拿)。null=还没 fetch 或没 meta。 */
  const [expandedMeta, setExpandedMeta] = useState<KnowledgeRunMeta | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  useEffect(() => {
    if (!activeProjectId && selectedProjects.length > 0) {
      setActiveProjectId(selectedProjects[0].id);
    }
    if (activeProjectId && !selectedProjects.find((p) => p.id === activeProjectId)) {
      setActiveProjectId(selectedProjects[0]?.id ?? null);
    }
  }, [selectedProjects, activeProjectId]);

  const activeProject = useMemo(
    () => selectedProjects.find((p) => p.id === activeProjectId) ?? null,
    [selectedProjects, activeProjectId]
  );
  const activeDoc = activeProjectId ? knowledgeDocs[activeProjectId] : undefined;
  const activeRun = activeProjectId ? knowledgeRuns[activeProjectId] : undefined;
  const running = activeRun?.status === "running";
  const pendingTargets = useMemo(
    () => selectedProjects.filter((p) => !knowledgeDocs[p.id]),
    [selectedProjects, knowledgeDocs]
  );

  // 切换项目时退出编辑模式 + 重置草稿
  useEffect(() => {
    setEditing(false);
    setDraft(activeDoc?.content ?? "");
    setHistoryOpen(false);
    setExpandedTs(null);
    setExpandedMeta(null);
  }, [activeProjectId, activeDoc?.content]);

  const refreshHistory = async () => {
    if (!activeProjectId) return;
    try {
      const items = await listResumeKnowledgeHistory(activeProjectId);
      setHistory(items);
    } catch (err) {
      console.error(err);
    }
  };

  const generateOne = async (project: Project) => {
    if (!provider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    const requestId = generateRequestId();
    startKnowledgeRun(project.id, requestId);
    try {
      const existing = knowledgeDocs[project.id]?.content;
      const { background, meta, qualityIssues } = await runKnowledgeAgent({
        project,
        provider,
        initialBackground: existing,
        onStep: (step) => appendKnowledgeStep(project.id, step),
      });
      const doc: ProjectKnowledge = {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        content: background,
        updatedAt: new Date().toISOString(),
        userEdited: false,
        qualityIssues,
      };
      // 透传 agent meta:后端用它写 <id>.meta.json,UI 用它做事后追溯。
      await upsertKnowledge(doc, false, meta);
      finishKnowledgeRun(project.id);
      const errCount = qualityIssues.filter((i) => i.severity === "error").length;
      const warnCount = qualityIssues.filter((i) => i.severity === "warn").length;
      if (errCount > 0) {
        showToast("warning", `${project.name} 生成完成,但有 ${errCount} 个质量问题待修正`);
      } else if (warnCount > 0) {
        showToast("success", `${project.name} 已生成 (${warnCount} 个质量提示)`);
      } else {
        showToast("success", `${project.name} 背景知识已生成`);
      }
      // 历史列表正打开时自动刷新一下(新增了一条 .meta.json sidecar)
      if (historyOpen && activeProjectId === project.id) {
        void refreshHistory();
      }
    } catch (err) {
      // 失败/取消时后端 run_knowledge_agent 已经在 match Err 分支写了 .fail.json,
      // 前端不要重复 record,只更新内存运行状态 + toast。
      const msg = err instanceof Error ? err.message : String(err);
      finishKnowledgeRun(project.id, msg);
      showToast("error", `${project.name} 生成失败: ${msg}`);
      if (historyOpen && activeProjectId === project.id) {
        void refreshHistory();
      }
    }
  };

  const handleGenerate = async () => {
    if (!activeProject) return;
    await generateOne(activeProject);
  };

  const handleGenerateAll = async () => {
    if (!provider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    if (pendingTargets.length === 0) {
      showToast("info", "全部已选项目都已生成背景知识");
      return;
    }
    setBulkRunning(true);
    try {
      for (const p of pendingTargets) {
        if (!useResumeStore.getState().knowledgeDocs[p.id]) {
          setActiveProjectId(p.id);
          await generateOne(p);
        }
      }
    } finally {
      setBulkRunning(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeProject) return;
    const doc: ProjectKnowledge = {
      projectId: activeProject.id,
      projectName: activeProject.name,
      projectPath: activeProject.path,
      content: draft,
      updatedAt: new Date().toISOString(),
      userEdited: true,
    };
    try {
      await upsertKnowledge(doc, true);
      setEditing(false);
      showToast("success", "已保存背景知识");
    } catch (err) {
      showToast(
        "error",
        `保存失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleRestoreHistory = async (entry: ResumeKnowledgeHistoryEntry) => {
    if (!activeProject) return;
    if (!entry.hasContent) {
      showToast("warning", "该条目没有可恢复的内容(失败/取消记录)");
      return;
    }
    try {
      const { content } = await readResumeKnowledgeHistory(activeProject.id, entry.timestamp);
      if (content == null) {
        showToast("warning", "该条目没有可恢复的内容");
        return;
      }
      setKnowledgeInMemory({
        projectId: activeProject.id,
        projectName: activeProject.name,
        projectPath: activeProject.path,
        content,
        updatedAt: new Date().toISOString(),
        userEdited: false,
      });
      setDraft(content);
      showToast("success", "已恢复历史版本到当前视图（保存后才会写盘并备份）");
    } catch (err) {
      showToast(
        "error",
        `恢复失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  /// 展开/折叠某条历史详情。展开时按需 fetch meta(legacy 条目可能没有,显示 fallback)。
  const handleToggleDetail = async (entry: ResumeKnowledgeHistoryEntry) => {
    if (!activeProject) return;
    if (expandedTs === entry.timestamp) {
      setExpandedTs(null);
      setExpandedMeta(null);
      return;
    }
    setExpandedTs(entry.timestamp);
    setExpandedMeta(null);
    try {
      const { meta } = await readResumeKnowledgeHistory(activeProject.id, entry.timestamp);
      setExpandedMeta(meta ?? null);
    } catch (err) {
      showToast(
        "error",
        `读取详情失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleDelete = async () => {
    if (!activeProject) return;
    if (!confirm("删除此项目的背景知识？历史版本会保留。")) return;
    await removeKnowledge(activeProject.id);
    showToast("success", "已删除");
  };

  const generatedCount = useMemo(
    () => selectedProjects.filter((p) => !!knowledgeDocs[p.id]).length,
    [selectedProjects, knowledgeDocs]
  );

  if (selectedProjects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={FileText}
          title="请先在「选项目」标签中选择至少一个项目"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
      {/* 左侧：项目列表 */}
      <div className="w-64 border-r border-gray-200 overflow-auto flex flex-col">
        <div className="px-3 py-2 text-xs text-gray-500 sticky top-0 bg-white border-b border-gray-100 flex items-center justify-between">
          <span>已选项目 ({selectedProjects.length})</span>
          {pendingTargets.length > 0 && (
            <button
              onClick={handleGenerateAll}
              disabled={bulkRunning || !provider}
              className="text-[11px] px-2 py-0.5 rounded text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title={`顺序生成剩余 ${pendingTargets.length} 个项目`}
            >
              {bulkRunning ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Wand2 size={11} />
              )}
              一键生成 ({pendingTargets.length})
            </button>
          )}
        </div>
        <ul className="py-1">
          {selectedProjects.map((p) => {
            const has = !!knowledgeDocs[p.id];
            const isActive = activeProjectId === p.id;
            const runState = knowledgeRuns[p.id];
            return (
              <li key={p.id}>
                <button
                  onClick={() => setActiveProjectId(p.id)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  {runState?.status === "running" ? (
                    <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />
                  ) : runState?.status === "error" ? (
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                  ) : has ? (
                    <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <span className="text-[10px] text-gray-400 flex-shrink-0">未生成</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 右侧：背景知识 */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeProject && (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-2">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{activeProject.name}</div>
                <div className="text-xs text-gray-500 truncate">{activeProject.path}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {activeDoc && !editing && (
                  <Button
                    onClick={() => {
                      setDraft(activeDoc.content);
                      setEditing(true);
                    }}
                    variant="secondary"
                    size="sm"
                    className="gap-1"
                  >
                    <Edit3 size={12} /> 编辑
                  </Button>
                )}
                {editing && (
                  <>
                    <Button
                      onClick={() => {
                        setEditing(false);
                        setDraft(activeDoc?.content ?? "");
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleSaveDraft}
                      variant="primary"
                      size="sm"
                      className="gap-1"
                    >
                      <Save size={12} /> 保存
                    </Button>
                  </>
                )}
                <Button
                  onClick={async () => {
                    await refreshHistory();
                    setHistoryOpen((v) => !v);
                  }}
                  disabled={!activeDoc}
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                >
                  <History size={12} /> 历史
                </Button>
                {activeDoc && (
                  <Button
                    onClick={handleDelete}
                    variant="secondary"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    title="删除当前版本"
                  >
                    <Trash2 size={12} />
                  </Button>
                )}
                <Button
                  onClick={handleGenerate}
                  disabled={running || !provider}
                  variant="primary"
                  size="sm"
                  className="gap-1"
                >
                  {running ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      生成中
                    </>
                  ) : (
                    <>
                      <RefreshCw size={12} />
                      {activeDoc ? "重新生成" : "生成"}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {historyOpen && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 max-h-72 overflow-auto">
                {history.length === 0 ? (
                  <div className="text-xs text-amber-700">暂无历史版本</div>
                ) : (
                  <ul className="space-y-1">
                    {history.map((h) => {
                      const d = new Date(parseInt(h.timestamp, 10));
                      const dateStr = isNaN(d.getTime())
                        ? h.timestamp
                        : d.toLocaleString("zh-CN");
                      const isExpanded = expandedTs === h.timestamp;
                      return (
                        <li key={h.timestamp}>
                          <div className="flex items-center justify-between text-xs text-amber-800 gap-2">
                            <button
                              onClick={() => handleToggleDetail(h)}
                              className="flex-1 min-w-0 flex items-center gap-2 text-left hover:bg-amber-100 rounded px-1 py-0.5"
                              title="点击查看详情"
                            >
                              {isExpanded ? (
                                <ChevronDown size={12} className="flex-shrink-0" />
                              ) : (
                                <ChevronRight size={12} className="flex-shrink-0" />
                              )}
                              <HistoryStatusIcon status={h.status} />
                              <span className="truncate flex-1">{dateStr}</span>
                              {h.modelName && (
                                <span className="text-amber-600 truncate max-w-[120px]" title={h.modelName}>
                                  {h.modelName}
                                </span>
                              )}
                              {h.durationMs != null && h.durationMs > 0 && (
                                <span className="text-amber-600">{formatDuration(h.durationMs)}</span>
                              )}
                              {h.stepCount != null && h.stepCount > 0 && (
                                <span className="text-amber-600">{h.stepCount} 步</span>
                              )}
                              {h.hasContent && <span className="text-amber-600">{h.size} B</span>}
                              {(h.qualityErrorCount ?? 0) > 0 && (
                                <span className="px-1 rounded bg-red-100 text-red-700" title="质量错误">
                                  ⨯{h.qualityErrorCount}
                                </span>
                              )}
                              {(h.qualityWarningCount ?? 0) > 0 && (
                                <span className="px-1 rounded bg-orange-100 text-orange-700" title="质量提示">
                                  ⚠{h.qualityWarningCount}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => handleRestoreHistory(h)}
                              disabled={!h.hasContent}
                              className="px-2 py-0.5 rounded border border-amber-300 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                              title={h.hasContent ? "恢复此版本" : "失败/取消记录,无内容可恢复"}
                            >
                              恢复
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="ml-5 mt-1 p-2 rounded border border-amber-200 bg-white text-[11px] text-gray-700 space-y-1">
                              {expandedMeta == null ? (
                                <div className="text-gray-400">(legacy 条目或无元信息)</div>
                              ) : (
                                <>
                                  <div>
                                    <span className="text-gray-500">来源:</span> {expandedMeta.source} ·{" "}
                                    <span className="text-gray-500">requestId:</span>{" "}
                                    <code className="text-[10px]">{expandedMeta.requestId}</code>
                                  </div>
                                  {expandedMeta.modelProvider && (
                                    <div>
                                      <span className="text-gray-500">供应商:</span> {expandedMeta.modelProvider}
                                    </div>
                                  )}
                                  {expandedMeta.error && (
                                    <div className="text-red-700">
                                      <span className="text-gray-500">错误:</span> {expandedMeta.error}
                                    </div>
                                  )}
                                  {expandedMeta.qualityIssues.length > 0 && (
                                    <div>
                                      <div className="text-gray-500">质检 ({expandedMeta.qualityIssues.length}):</div>
                                      <ul className="ml-3 list-disc space-y-0.5">
                                        {expandedMeta.qualityIssues.map((q, i) => (
                                          <li
                                            key={i}
                                            className={
                                              q.severity === "error"
                                                ? "text-red-700"
                                                : "text-orange-700"
                                            }
                                          >
                                            [{q.code}] {q.message}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="flex-1 overflow-auto p-4 min-h-0">
              {!activeDoc && !running && (
                <div className="h-full flex items-center justify-center">
                  <EmptyState
                    icon={AlertCircle}
                    title="此项目尚未生成背景知识"
                    description="点击右上角「生成」按钮开始"
                  />
                </div>
              )}
              {running && (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 text-sm text-blue-600 mb-3">
                    <Loader2 size={14} className="animate-spin" />
                    Agent 正在探索项目代码...
                  </div>
                  <div className="flex-1 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-mono text-gray-700 space-y-0.5 min-h-0">
                    {!activeRun || activeRun.steps.length === 0 ? (
                      <div className="text-gray-400">等待 Agent 响应...</div>
                    ) : (
                      activeRun.steps.map((s, i) => <div key={i}>{formatStep(s)}</div>)
                    )}
                  </div>
                </div>
              )}
              {activeDoc && !running && (
                <>
                  {activeDoc.qualityIssues && activeDoc.qualityIssues.length > 0 && (
                    <QualityBanner issues={activeDoc.qualityIssues} />
                  )}
                  {editing ? (
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="w-full h-full font-mono text-xs p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="背景知识 Markdown..."
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <pre className="text-xs whitespace-pre-wrap font-mono bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {activeDoc.content}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>

            {activeDoc && !editing && (
              <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <Eye size={12} />
                  预览模式
                  {activeDoc.userEdited && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                      已手编
                    </span>
                  )}
                </div>
                <span>更新于 {new Date(activeDoc.updatedAt).toLocaleString("zh-CN")}</span>
              </div>
            )}
          </>
        )}
      </div>
      </div>

      {onNext && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white">
          <div className="text-xs text-gray-500">
            已生成 {generatedCount} / {selectedProjects.length} 个项目的背景知识
          </div>
          <Button
            onClick={onNext}
            disabled={generatedCount === 0 || bulkRunning}
            variant="primary"
            size="md"
            className="gap-2"
          >
            <Wand2 size={16} />
            下一步：生成简历
          </Button>
        </div>
      )}
    </div>
  );
}

function formatStep(step: AgentStep): string {
  switch (step.kind) {
    case "tool_call":
      return `调用 ${step.label ?? "tool"}`;
    case "tool_result":
      return `${step.label ?? "tool"} 返回`;
    case "todo_update":
      return "更新待办";
    case "llm_text":
      return step.label ?? "模型输出";
    default:
      return `错误: ${step.detail ?? ""}`;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return `${m}m${rest}s`;
}

function HistoryStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" aria-label="成功" />;
    case "manual":
      return <PencilLine size={12} className="text-blue-600 flex-shrink-0" aria-label="手编保存" />;
    case "error":
      return <XCircle size={12} className="text-red-600 flex-shrink-0" aria-label="失败" />;
    case "cancelled":
      return <Ban size={12} className="text-gray-500 flex-shrink-0" aria-label="取消" />;
    default:
      return <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" />;
  }
}

function QualityBanner({ issues }: { issues: QualityIssue[] }) {
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  if (errors.length === 0 && warns.length === 0) return null;
  const hasError = errors.length > 0;
  const cls = hasError
    ? "bg-red-50 border-red-200 text-red-800"
    : "bg-amber-50 border-amber-200 text-amber-800";
  const Icon = hasError ? AlertCircle : AlertTriangle;
  return (
    <div className={`mb-3 rounded-lg border p-3 text-xs ${cls}`}>
      <div className="flex items-center gap-2 font-medium mb-1">
        <Icon size={14} />
        质量检查:{errors.length > 0 && ` ${errors.length} 个错误`}
        {errors.length > 0 && warns.length > 0 && " ·"}
        {warns.length > 0 && ` ${warns.length} 个提示`}
      </div>
      <ul className="ml-5 list-disc space-y-0.5">
        {[...errors, ...warns].map((i, idx) => (
          <li key={idx}>
            <code className="text-[10px] mr-1">[{i.code}]</code>
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
