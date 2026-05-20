import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  AlertCircle,
  Bot,
  Settings,
  Wand2,
  Database,
  ListChecks,
  Trash2,
  FileDown,
  Pencil,
  Plus,
  ChevronLeft,
} from "lucide-react";
import { useProjectsStore } from "@/stores/projectsStore";
import { useAiProvidersStore } from "@/stores/aiProvidersStore";
import { useUiStore } from "@/stores/uiStore";
import { useResumeStore } from "@/stores/resumeStore";
import type { JobDirection, Tone, ResumeV2 } from "@/types/resume";
import { exportResumeV2ToMarkdownWithDialog } from "@/services/resume/export";
import { Button, showToast } from "@/components/ui";
import { EmptyState } from "@/components/common";
import { ToolPanelHeader } from "../index";
import { KnowledgePanel } from "./KnowledgePanel";
import { JobConfigPanel } from "./JobConfigPanel";
import { ResumePanelV2 } from "./ResumePanelV2";
import { SaveResumeDialog } from "./SaveResumeDialog";

type Tab = "select" | "knowledge" | "resume";
type View = "history" | "workflow";

interface ResumeGeneratorProps {
  onBack: () => void;
}

export function ResumeGenerator({ onBack }: ResumeGeneratorProps) {
  const projects = useProjectsStore((s) => s.projects);
  const { aiProviders } = useAiProvidersStore();
  const setCurrentPage = useUiStore((s) => s.setCurrentPage);
  const {
    knowledgeDocs,
    loadAllKnowledgeFromDisk,
    savedResumes,
    setSavedResumes,
  } = useResumeStore();

  const [view, setView] = useState<View>(() =>
    savedResumes.length > 0 ? "history" : "workflow"
  );
  const [activeTab, setActiveTab] = useState<Tab>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobDirection, setJobDirection] = useState<JobDirection>("backend");
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>("professional");
  const [resume, setResume] = useState<ResumeV2 | null>(null);
  const [saveDialogResume, setSaveDialogResume] = useState<ResumeV2 | null>(null);
  const [renameTarget, setRenameTarget] = useState<ResumeV2 | null>(null);

  // 启动加载磁盘上已有的背景知识
  useEffect(() => {
    loadAllKnowledgeFromDisk((id) => {
      const p = projects.find((p) => p.id === id);
      return p ? { name: p.name, path: p.path } : undefined;
    });
  }, [loadAllKnowledgeFromDisk, projects]);

  const defaultProvider = aiProviders.find((p) => p.isDefaultProvider && p.enabled) ?? null;
  const hasProviders = aiProviders.length > 0;
  const hasAvailableProvider = aiProviders.some((p) => p.enabled);

  const selectedProjects = useMemo(
    () => projects.filter((p) => selectedIds.has(p.id)),
    [projects, selectedIds]
  );

  const selectedKnowledgeDocs = useMemo(
    () => selectedProjects.map((p) => knowledgeDocs[p.id]).filter(Boolean),
    [selectedProjects, knowledgeDocs]
  );

  const goToAISettings = () => {
    setCurrentPage("aiProviders");
    onBack();
  };

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleSaveResume = async (r: ResumeV2) => {
    // 打开命名 dialog,真正的写盘在 persistResume 里。返回 Promise 以兼容 ResumePanelV2 的 await。
    setSaveDialogResume(r);
  };

  const defaultResumeName = useMemo(() => {
    if (!saveDialogResume) return "";
    if (saveDialogResume.name) return saveDialogResume.name;
    const date = new Date().toLocaleDateString("zh-CN");
    return `${saveDialogResume.jobDirection} · ${saveDialogResume.experiences.length} 个项目 · ${date}`;
  }, [saveDialogResume]);

  const persistResume = async (name: string) => {
    if (!saveDialogResume) return;
    const stored: ResumeV2 = {
      ...saveDialogResume,
      name,
      updatedAt: new Date().toISOString(),
      isSaved: true,
    };
    const updated = [stored, ...savedResumes.filter((s) => s.id !== stored.id)];
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_resumes", { data: updated });
      setSavedResumes(updated);
      setResume(stored);
      setSaveDialogResume(null);
      showToast("success", "已保存");
    } catch (err) {
      console.error("保存简历失败:", err);
      showToast("error", `保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenSaved = (r: ResumeV2) => {
    setResume(r);
    setJobDirection(r.jobDirection);
    setJdKeywords(r.jdKeywords || []);
    setTone(r.tone);
    setSelectedIds(new Set(r.experiences.map((e) => e.projectId)));
    setActiveTab("resume");
    setView("workflow");
  };

  const handleDeleteSaved = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = savedResumes.filter((r) => r.id !== id);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_resumes", { data: updated });
      setSavedResumes(updated);
    } catch (err) {
      console.error(err);
      showToast("error", `删除失败: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    showToast("success", "已删除");
  };

  const handleExportSaved = async (e: React.MouseEvent, r: ResumeV2) => {
    e.stopPropagation();
    try {
      const filePath = await exportResumeV2ToMarkdownWithDialog(r);
      if (filePath) showToast("success", `已导出到 ${filePath}`);
    } catch (err) {
      showToast("error", `导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRenameSaved = (e: React.MouseEvent, r: ResumeV2) => {
    e.stopPropagation();
    setRenameTarget(r);
  };

  const persistRename = async (name: string) => {
    if (!renameTarget) return;
    const renamed: ResumeV2 = {
      ...renameTarget,
      name,
      updatedAt: new Date().toISOString(),
    };
    const updated = savedResumes.map((r) => (r.id === renamed.id ? renamed : r));
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_resumes", { data: updated });
      setSavedResumes(updated);
      if (resume?.id === renamed.id) setResume(renamed);
      setRenameTarget(null);
      showToast("success", "已重命名");
    } catch (err) {
      console.error(err);
      showToast("error", `重命名失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const renderProviderStatus = () => {
    if (!hasProviders || !hasAvailableProvider || !defaultProvider) {
      const msg = !hasProviders
        ? "未配置 AI 供应商"
        : !hasAvailableProvider
        ? "没有启用的 AI 供应商"
        : "未设置默认 AI 供应商";
      return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-amber-800">{msg}</div>
              <div className="text-sm text-amber-700 mt-1">
                简历生成需要使用支持工具调用的 AI 模型。请先配置并启用一个默认供应商。
              </div>
              <Button
                onClick={goToAISettings}
                size="sm"
                className="mt-2 gap-1 bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200"
                variant="secondary"
              >
                <Settings size={14} /> 前往配置
              </Button>
            </div>
          </div>
        </div>
      );
    }
    const defaultModel =
      defaultProvider.models.find((m) => m.isDefault && m.enabled) ||
      defaultProvider.models.find((m) => m.enabled);
    return (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-3">
          <Bot size={18} className="text-green-600" />
          <div className="flex-1 text-sm text-green-800">
            使用 <span className="font-medium">{defaultProvider.name}</span>
            {defaultModel && <span className="text-green-600"> / {defaultModel.model}</span>}
          </div>
          <button
            onClick={goToAISettings}
            className="text-xs text-green-700 hover:text-green-800 flex items-center gap-1"
          >
            <Settings size={12} /> 切换
          </button>
        </div>
      </div>
    );
  };

  const renderSelectTab = () => (
    <div className="space-y-5">
      {renderProviderStatus()}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-900">
            选择项目 ({selectedIds.size}/{projects.length})
          </h3>
          <button
            onClick={toggleAll}
            className="text-xs text-blue-600 hover:text-blue-700"
            disabled={projects.length === 0}
          >
            {selectedIds.size === projects.length && projects.length > 0
              ? "取消全选"
              : "全选"}
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="bg-gray-50 rounded-lg">
            <EmptyState
              icon={FileText}
              title="书架中没有项目"
              description="请先添加项目到书架"
              className="py-8"
            />
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {projects.map((p) => {
              const checked = selectedIds.has(p.id);
              const hasKnowledge = !!knowledgeDocs[p.id];
              return (
                <label
                  key={p.id}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                    checked
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProject(p.id)}
                    className="mr-3"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <span className="truncate">{p.name}</span>
                      {hasKnowledge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          已生成背景知识
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{p.path}</div>
                    {p.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.labels.slice(0, 5).map((l) => (
                          <span
                            key={l}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-200">
        <Button
          onClick={() => setActiveTab("knowledge")}
          disabled={selectedIds.size === 0}
          variant="primary"
          size="md"
          className="gap-2"
        >
          <Database size={16} />
          下一步：生成 / 查看背景知识
        </Button>
      </div>
    </div>
  );

  const renderResumeTab = () => (
    <div className="space-y-6">
      {renderProviderStatus()}
      {selectedKnowledgeDocs.length === 0 && !resume ? (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <EmptyState
            icon={ListChecks}
            title="还没有可用的背景知识"
            description="请回到「背景知识」标签，为已选项目生成背景知识"
            className="py-8"
          />
        </div>
      ) : (
        <>
          <JobConfigPanel
            jobDirection={jobDirection}
            onJobDirectionChange={setJobDirection}
            jdKeywords={jdKeywords}
            onJdKeywordsChange={setJdKeywords}
            tone={tone}
            onToneChange={setTone}
          />
          <ResumePanelV2
            knowledgeDocs={selectedKnowledgeDocs}
            provider={defaultProvider}
            jobDirection={jobDirection}
            jdKeywords={jdKeywords}
            tone={tone}
            resume={resume}
            onResumeChange={setResume}
            onSaveResume={handleSaveResume}
          />
        </>
      )}
    </div>
  );

  const renderHistoryView = () => (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <h3 className="text-base font-medium text-gray-900">我的简历</h3>
          <p className="text-xs text-gray-500 mt-1">
            选择一份继续编辑、导出，或新建一份。
          </p>
        </div>
        <div className="space-y-2">
          {savedResumes.map((r) => (
            <div
              key={r.id}
              onClick={() => handleOpenSaved(r)}
              className="flex items-center justify-between gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {r.name || `${r.jobDirection} · ${r.experiences.length} 个项目`}
                </div>
                <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {r.jobDirection}
                  </span>
                  <span>{r.experiences.length} 个项目</span>
                  <span>·</span>
                  <span>
                    {new Date(r.updatedAt || r.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleExportSaved(e, r)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                  title="导出 Markdown"
                >
                  <FileDown size={14} />
                </button>
                <button
                  onClick={(e) => handleRenameSaved(e, r)}
                  className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600"
                  title="重命名"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => handleDeleteSaved(e, r.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const TABS: Array<{
    id: Tab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    disabled?: boolean;
  }> = [
    {
      id: "select",
      label: "选项目",
      icon: <ListChecks size={14} />,
      badge: selectedIds.size > 0 ? String(selectedIds.size) : undefined,
    },
    {
      id: "knowledge",
      label: "背景知识",
      icon: <Database size={14} />,
      badge:
        selectedKnowledgeDocs.length > 0
          ? `${selectedKnowledgeDocs.length}/${selectedIds.size}`
          : undefined,
      disabled: selectedIds.size === 0,
    },
    {
      id: "resume",
      label: "简历",
      icon: <Wand2 size={14} />,
      disabled: selectedKnowledgeDocs.length === 0,
    },
  ];

  const renderTabs = () => (
    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
      {TABS.map((t) => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            disabled={t.disabled}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              active
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : t.disabled
                ? "text-gray-300 cursor-not-allowed"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  active ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const showHistory = view === "history" && savedResumes.length > 0;

  const headerActions = showHistory ? (
    <Button
      onClick={() => {
        setView("workflow");
        setActiveTab("select");
      }}
      variant="primary"
      size="sm"
      className="gap-1.5"
    >
      <Plus size={14} /> 新建简历
    </Button>
  ) : savedResumes.length > 0 ? (
    <button
      onClick={() => setView("history")}
      className="text-sm text-gray-600 hover:text-blue-600 flex items-center gap-1"
    >
      <ChevronLeft size={16} /> 我的简历
    </button>
  ) : null;

  return (
    <div className="flex flex-col h-full bg-white">
      <ToolPanelHeader
        title="简历生成器"
        icon={FileText}
        onBack={onBack}
        actions={headerActions}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {showHistory ? (
          renderHistoryView()
        ) : activeTab === "knowledge" ? (
          <>
            <div className="px-6 pt-6 pb-4">
              <div className="max-w-4xl mx-auto">{renderTabs()}</div>
            </div>
            <KnowledgePanel
              selectedProjects={selectedProjects}
              provider={defaultProvider}
              onNext={() => setActiveTab("resume")}
            />
          </>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-5">
              {renderTabs()}
              {activeTab === "select" && renderSelectTab()}
              {activeTab === "resume" && renderResumeTab()}
            </div>
          </div>
        )}
      </div>

      <SaveResumeDialog
        open={!!saveDialogResume}
        defaultName={defaultResumeName}
        onCancel={() => setSaveDialogResume(null)}
        onConfirm={persistResume}
      />

      <SaveResumeDialog
        open={!!renameTarget}
        title="重命名简历"
        defaultName={
          renameTarget?.name ||
          `${renameTarget?.jobDirection ?? ""} · ${renameTarget?.experiences.length ?? 0} 个项目`
        }
        onCancel={() => setRenameTarget(null)}
        onConfirm={persistRename}
      />
    </div>
  );
}
