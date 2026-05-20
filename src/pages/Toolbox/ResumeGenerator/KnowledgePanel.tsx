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
  CheckCircle2,
  Trash2,
  Wand2,
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
import { Button, showToast } from "@/components/ui";
import { EmptyState } from "@/components/common";

interface KnowledgePanelProps {
  selectedProjects: Project[];
  provider: AiProviderConfig | null;
}

interface HistoryItem {
  timestamp: string;
  size: number;
}

export function KnowledgePanel({ selectedProjects, provider }: KnowledgePanelProps) {
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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
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
      const { background } = await runKnowledgeAgent({
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
      };
      await upsertKnowledge(doc, false);
      finishKnowledgeRun(project.id);
      showToast("success", `${project.name} 背景知识已生成`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finishKnowledgeRun(project.id, msg);
      showToast("error", `${project.name} 生成失败: ${msg}`);
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

  const handleRestoreHistory = async (timestamp: string) => {
    if (!activeProject) return;
    try {
      const content = await readResumeKnowledgeHistory(activeProject.id, timestamp);
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

  const handleDelete = async () => {
    if (!activeProject) return;
    if (!confirm("删除此项目的背景知识？历史版本会保留。")) return;
    await removeKnowledge(activeProject.id);
    showToast("success", "已删除");
  };

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
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 max-h-40 overflow-auto">
                {history.length === 0 ? (
                  <div className="text-xs text-amber-700">暂无历史版本</div>
                ) : (
                  <ul className="space-y-1">
                    {history.map((h) => {
                      const d = new Date(parseInt(h.timestamp, 10));
                      const dateStr = isNaN(d.getTime())
                        ? h.timestamp
                        : d.toLocaleString("zh-CN");
                      return (
                        <li
                          key={h.timestamp}
                          className="flex items-center justify-between text-xs text-amber-800"
                        >
                          <span>
                            {dateStr} · {h.size} 字节
                          </span>
                          <button
                            onClick={() => handleRestoreHistory(h.timestamp)}
                            className="px-2 py-0.5 rounded border border-amber-300 hover:bg-amber-100"
                          >
                            恢复
                          </button>
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
                editing ? (
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
                )
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

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
