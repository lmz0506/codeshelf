import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  ChevronLeft,
  AlertCircle,
  Bot,
  Settings,
  Wand2,
  Database,
  ListChecks,
  History,
  Trash2,
} from "lucide-react";
import { useProjectsStore } from "@/stores/projectsStore";
import { useAiProvidersStore } from "@/stores/aiProvidersStore";
import { useUiStore } from "@/stores/uiStore";
import { useResumeStore } from "@/stores/resumeStore";
import type { JobDirection, Tone, ResumeV2 } from "@/types/resume";
import { showToast } from "@/components/ui";
import { KnowledgePanel } from "./KnowledgePanel";
import { JobConfigPanel } from "./JobConfigPanel";
import { ResumePanelV2 } from "./ResumePanelV2";

type Tab = "select" | "knowledge" | "resume";

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

  const [activeTab, setActiveTab] = useState<Tab>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobDirection, setJobDirection] = useState<JobDirection>("backend");
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>("professional");
  const [resume, setResume] = useState<ResumeV2 | null>(null);

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
    const stored: ResumeV2 = {
      ...r,
      updatedAt: new Date().toISOString(),
      isSaved: true,
    };
    const updated = [stored, ...savedResumes.filter((s) => s.id !== r.id)];
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_resumes", { data: updated });
      setSavedResumes(updated);
      setResume(stored);
    } catch (err) {
      console.error("保存简历失败:", err);
      throw err;
    }
  };

  const handleOpenSaved = (r: ResumeV2) => {
    setResume(r);
    setJobDirection(r.jobDirection);
    setJdKeywords(r.jdKeywords || []);
    setTone(r.tone);
    setSelectedIds(new Set(r.experiences.map((e) => e.projectId)));
    setActiveTab("resume");
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
              <button
                onClick={goToAISettings}
                className="mt-2 px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 flex items-center gap-1"
              >
                <Settings size={14} /> 前往配置
              </button>
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
    <div className="space-y-5 max-w-4xl">
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
          <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-lg">
            <FileText size={42} className="mx-auto mb-3 opacity-50" />
            <p>书架中没有项目</p>
            <p className="text-xs mt-1">请先添加项目到书架</p>
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
        <button
          onClick={() => setActiveTab("knowledge")}
          disabled={selectedIds.size === 0}
          className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
        >
          <Database size={16} />
          下一步：生成 / 查看背景知识
        </button>
      </div>

      {savedResumes.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <History size={16} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-900">历史简历</h3>
            <span className="text-xs text-gray-400">({savedResumes.length})</span>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-auto">
            {savedResumes.map((r) => (
              <div
                key={r.id}
                onClick={() => handleOpenSaved(r)}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {r.jobDirection} · {r.experiences.length} 个项目
                    {r.isSaved && <span className="ml-1 text-xs text-green-600">已保存</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(r.updatedAt || r.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteSaved(e, r.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderResumeTab = () => (
    <div className="space-y-6 max-w-4xl">
      {renderProviderStatus()}
      {selectedKnowledgeDocs.length === 0 && !resume ? (
        <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <ListChecks size={42} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">还没有可用的背景知识</p>
          <p className="text-xs mt-1">
            请回到「背景知识」标签，为已选项目生成背景知识
          </p>
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

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="re-header sticky top-0 z-20" data-tauri-drag-region>
        <span className="toggle" onClick={onBack}>
          <ChevronLeft size={16} />
        </span>
        <div className="flex items-center gap-2 mr-4" data-tauri-drag-region>
          <FileText size={18} className="text-blue-500" />
          <span className="text-lg font-semibold">简历生成器</span>
          <span className="text-xs text-gray-400 ml-2">Deep Agents</span>
        </div>
        <div className="flex-1" data-tauri-drag-region />
      </header>

      <div className="border-b border-gray-200">
        <div className="flex items-center gap-1 px-6">
          <TabBtn
            active={activeTab === "select"}
            onClick={() => setActiveTab("select")}
            icon={<ListChecks size={14} />}
            label="选项目"
            badge={selectedIds.size > 0 ? String(selectedIds.size) : undefined}
          />
          <TabBtn
            active={activeTab === "knowledge"}
            onClick={() => setActiveTab("knowledge")}
            icon={<Database size={14} />}
            label="背景知识"
            badge={
              selectedKnowledgeDocs.length > 0
                ? `${selectedKnowledgeDocs.length}/${selectedIds.size}`
                : undefined
            }
            disabled={selectedIds.size === 0}
          />
          <TabBtn
            active={activeTab === "resume"}
            onClick={() => setActiveTab("resume")}
            icon={<Wand2 size={14} />}
            label="简历"
            disabled={selectedKnowledgeDocs.length === 0}
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === "select" && (
          <div className="flex-1 overflow-auto p-6">{renderSelectTab()}</div>
        )}
        {activeTab === "knowledge" && (
          <KnowledgePanel selectedProjects={selectedProjects} provider={defaultProvider} />
        )}
        {activeTab === "resume" && (
          <div className="flex-1 overflow-auto p-6">{renderResumeTab()}</div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
  badge,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
        active
          ? "border-blue-600 text-blue-600"
          : disabled
          ? "border-transparent text-gray-300 cursor-not-allowed"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span
          className={`px-1.5 py-0.5 rounded-full text-[10px] ${
            active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
