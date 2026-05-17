import { useState, useCallback, useEffect } from "react";
import {
  FileText,
  Loader2,
  RefreshCw,
  CheckCircle,
  Wand2,
  ChevronLeft,
  AlertCircle,
  Bot,
  Settings,
  Eye,
  FileDown,
  ShieldAlert,
  ChevronDown,
  X,
  Plus,
  Save,
  History,
  Trash2,
} from "lucide-react";
import { useProjectsStore } from "@/stores/projectsStore";
import { useAiProvidersStore } from "@/stores/aiProvidersStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useResumeStore } from "@/stores/resumeStore";
import { formatTimeRange } from "./useResumeData";
import { ResumeEditor } from "./ResumeEditor";
import { ResumePreview } from "./ResumePreview";
import { ProjectAnalyzer } from "./ProjectAnalyzer";
import { JOB_DIRECTIONS, type JobDirection, type ProjectExperience, type GeneratedResume } from "@/types/resume";
import { exportResumeToMarkdown, exportResumeToFileWithDialog } from "@/services/resume/export";
import { generateSingleExperience } from "@/services/resume/aiGenerator";
import { showToast } from "@/components/ui";

interface ResumeGeneratorProps {
  onBack: () => void;
}

export function ResumeGenerator({ onBack }: ResumeGeneratorProps) {
  const projects = useProjectsStore((s) => s.projects);
  const { aiProviders } = useAiProvidersStore();
  const setCurrentPage = useUiStore((s) => s.setCurrentPage);
  const { sensitiveFilePatterns, setSensitiveFilePatterns } = useSettingsStore();
  const {
    resumeGeneratorState,
    setResumeGeneratorData,
    setGeneratedResume,
    setResumeGeneratorDirection,
    setResumeGeneratorSelectedProjects,
    setResumeGeneratorOpen,
    setResumeGeneratorAnalyzing,
    clearResumeGeneratorState,
    savedResumes,
    saveCurrentResume,
    loadSavedResume,
    deleteSavedResume,
  } = useResumeStore();

  // 从 store 恢复状态
  const [selectedDirection, setSelectedDirection] = useState<JobDirection>(
    resumeGeneratorState.selectedDirection || "backend"
  );
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set(resumeGeneratorState.selectedProjects || [])
  );
  const [activeTab, setActiveTab] = useState<"select" | "preview" | "view">(
    resumeGeneratorState.generatedResume ? "preview" : "select"
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showProjectAnalyzer, setShowProjectAnalyzer] = useState(false);
  const [showSensitiveConfig, setShowSensitiveConfig] = useState(false);
  const [newPatternInput, setNewPatternInput] = useState("");

  // 组件挂载时标记为打开
  useEffect(() => {
    setResumeGeneratorOpen(true);

    // 如果之前正在分析中，恢复分析界面
    if (resumeGeneratorState.isAnalyzing) {
      setShowProjectAnalyzer(true);
    }

    return () => {
      setResumeGeneratorOpen(false);
    };
  }, []);

  // 检查 AI 供应商状态
  const defaultProvider = aiProviders.find((p) => p.isDefaultProvider && p.enabled);
  const hasAvailableProvider = aiProviders.some((p) => p.enabled);
  const hasProviders = aiProviders.length > 0;

  // 跳转到 AI 设置
  const goToAISettings = () => {
    setCurrentPage("aiProviders");
    onBack();
  };

  // 切换项目选择
  const toggleProject = (projectId: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      // 同步到 store
      setResumeGeneratorSelectedProjects(Array.from(next));
      return next;
    });
  };

  // 全选/取消全选
  const toggleAll = () => {
    let next: Set<string>;
    if (selectedProjects.size === projects.length) {
      next = new Set();
    } else {
      next = new Set(projects.map((p) => p.id));
    }
    setSelectedProjects(next);
    setResumeGeneratorSelectedProjects(Array.from(next));
  };

  // 开始 AI 分析（从项目选择界面）
  const handleStartCollection = async () => {
    if (selectedProjects.size === 0) {
      showToast("warning", "请至少选择一个项目");
      return;
    }
    if (!defaultProvider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    // 直接启动项目分析器
    setShowProjectAnalyzer(true);
    setResumeGeneratorAnalyzing(true);
  };

  // 重新分析
  const handleReanalyze = () => {
    setResumeGeneratorData(null);
    setGeneratedResume(null);
    clearResumeGeneratorState();
    setActiveTab("select");
    setSelectedProjects(new Set());
    setResumeGeneratorSelectedProjects([]);
  };

  // AI 生成项目经历 - 显示对话过程
  const handleGenerate = () => {
    if (!defaultProvider) {
      showToast("error", "没有可用的 AI 供应商");
      return;
    }

    setShowProjectAnalyzer(true);
    setResumeGeneratorAnalyzing(true);
  };

  // 处理生成完成
  const handleGenerationComplete = (resume: GeneratedResume) => {
    setGeneratedResume(resume);
    setShowProjectAnalyzer(false);
    setResumeGeneratorAnalyzing(false);
    setActiveTab("preview"); // 自动切换到预览标签
    showToast("success", "简历生成完成");
    // 自动保存到持久化存储
    setTimeout(() => {
      useResumeStore.getState().saveCurrentResume();
    }, 100);
  };

  // 处理生成错误
  const handleGenerationError = (error: string) => {
    setShowProjectAnalyzer(false);
    setResumeGeneratorAnalyzing(false);
    showToast("error", error);
  };

  // 用户主动取消生成
  const handleUserCancel = () => {
    setShowProjectAnalyzer(false);
    setResumeGeneratorAnalyzing(false);
  };

  // 关闭分析器（菜单切换时调用）
  const handleCloseAnalyzer = () => {
    // 菜单切换时不停止分析，只是隐藏界面
    setShowProjectAnalyzer(false);
  };

  // 更新项目经历
  const handleUpdateExperience = useCallback((updated: ProjectExperience) => {
    const currentResume = resumeGeneratorState.generatedResume;
    if (!currentResume) return;

    const newResume = {
      ...currentResume,
      experiences: currentResume.experiences.map((e) =>
        e.projectId === updated.projectId ? updated : e
      ),
      updatedAt: new Date().toISOString(),
    };
    setGeneratedResume(newResume);
    // 自动保存编辑后的内容
    setTimeout(() => {
      useResumeStore.getState().saveCurrentResume();
    }, 100);
  }, [resumeGeneratorState.generatedResume]);

  // 导出 Markdown（让用户选择路径）
  const handleExportMarkdown = async () => {
    const currentResume = resumeGeneratorState.generatedResume;
    if (!currentResume) return;

    try {
      const markdown = exportResumeToMarkdown(currentResume);
      const timestamp = new Date().toISOString().slice(0, 10);
      const defaultFilename = `resume-${timestamp}-${Date.now()}.md`;

      const filePath = await exportResumeToFileWithDialog(markdown, defaultFilename);

      if (filePath) {
        showToast("success", `已导出到: ${filePath}`);
      }
    } catch (err) {
      showToast("error", `导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 重新生成单个项目
  const handleRegenerateProject = async (projectId: string) => {
    const currentResume = resumeGeneratorState.generatedResume;
    if (!defaultProvider || !currentResume) return;

    const experience = currentResume.experiences.find((p) => p.projectId === projectId);
    if (!experience) return;

    try {
      const direction = JOB_DIRECTIONS.find((d) => d.id === selectedDirection)!;
      const starExperience = await generateSingleExperience(
        experience,
        direction,
        defaultProvider
      );

      handleUpdateExperience({
        ...experience,
        starExperience,
        isEdited: false,
      });

      showToast("success", "已重新生成");
    } catch (err) {
      showToast("error", "重新生成失败");
    }
  };

  // 加载已保存的简历
  const handleLoadResume = (resume: GeneratedResume) => {
    loadSavedResume(resume);
    setSelectedDirection(resume.jobDirection);
    setSelectedProjects(new Set(resume.experiences.map((e) => e.projectId)));
    setActiveTab("preview");
  };

  // 删除已保存的简历
  const handleDeleteResume = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSavedResume(id);
    showToast("success", "已删除简历记录");
  };

  // 手动保存
  const handleSaveResume = async () => {
    await saveCurrentResume();
    showToast("success", "简历已保存");
  };

  // 切换岗位方向
  const handleDirectionChange = (direction: JobDirection) => {
    setSelectedDirection(direction);
    setResumeGeneratorDirection(direction);
  };

  // 渲染 AI 供应商状态
  const renderAIProviderStatus = () => {
    if (!hasProviders) {
      return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-amber-800">未配置 AI 供应商</div>
              <div className="text-sm text-amber-700 mt-1">
                简历生成需要使用 AI 分析项目数据，请先配置 AI 供应商并设为默认。
              </div>
              <button
                onClick={goToAISettings}
                className="mt-2 px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 flex items-center gap-1"
              >
                <Settings size={14} />
                前往配置
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!hasAvailableProvider) {
      return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-amber-800">没有启用的 AI 供应商</div>
              <div className="text-sm text-amber-700 mt-1">
                您已配置 {aiProviders.length} 个供应商，但都没有启用。请至少启用一个供应商并设为默认。
              </div>
              <button
                onClick={goToAISettings}
                className="mt-2 px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 flex items-center gap-1"
              >
                <Settings size={14} />
                前往配置
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!defaultProvider) {
      return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-amber-800">未设置默认 AI 供应商</div>
              <div className="text-sm text-amber-700 mt-1">
                您有 {aiProviders.filter(p => p.enabled).length} 个启用的供应商，但需要设置一个为默认才能使用。
              </div>
              <button
                onClick={goToAISettings}
                className="mt-2 px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 flex items-center gap-1"
              >
                <Settings size={14} />
                前往配置
              </button>
            </div>
          </div>
        </div>
      );
    }

    const defaultModel = defaultProvider.models.find((m) => m.isDefault && m.enabled) ||
                        defaultProvider.models.find((m) => m.enabled);

    return (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-3">
          <Bot size={18} className="text-green-600" />
          <div className="flex-1">
            <div className="text-sm text-green-800">
              使用 <span className="font-medium">{defaultProvider.name}</span>
              {defaultModel && (
                <span className="text-green-600"> / {defaultModel.model}</span>
              )}
            </div>
          </div>
          <button
            onClick={goToAISettings}
            className="text-xs text-green-700 hover:text-green-800 flex items-center gap-1"
          >
            <Settings size={12} />
            切换
          </button>
        </div>
      </div>
    );
  };

  // 渲染项目选择界面
  const renderProjectSelection = () => (
    <div className="space-y-6">
      {renderAIProviderStatus()}

      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">选择岗位方向</h3>
        <div className="grid grid-cols-3 gap-3">
          {JOB_DIRECTIONS.map((direction) => (
            <button
              key={direction.id}
              onClick={() => handleDirectionChange(direction.id)}
              className={`p-4 rounded-lg border text-left transition-all ${
                selectedDirection === direction.id
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="font-medium text-gray-900">{direction.name}</div>
              <div className="text-xs text-gray-500 mt-1">{direction.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">
            选择项目 ({selectedProjects.size}/{projects.length})
          </h3>
          <button
            onClick={toggleAll}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {selectedProjects.size === projects.length ? "取消全选" : "全选"}
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-lg">
            <FileText size={48} className="mx-auto mb-3 opacity-50" />
            <p>书架中没有项目</p>
            <p className="text-xs mt-1">请先添加项目到书架</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {projects.map((project) => (
              <label
                key={project.id}
                className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedProjects.has(project.id)
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedProjects.has(project.id)}
                  onChange={() => toggleProject(project.id)}
                  className="mr-3"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{project.name}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span className="truncate">{project.path}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {project.labels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600"
                      >
                        {label}
                      </span>
                    ))}
                    {project.labels.length > 3 && (
                      <span className="text-[10px] text-gray-400">
                        +{project.labels.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 敏感文件过滤规则 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowSensitiveConfig(!showSensitiveConfig)}
          className="w-full flex items-center justify-between p-3 text-sm text-gray-700 hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-500" />
            <span>敏感文件过滤规则</span>
            <span className="text-xs text-gray-400">({sensitiveFilePatterns.length} 条)</span>
          </div>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${showSensitiveConfig ? "rotate-180" : ""}`} />
        </button>
        {showSensitiveConfig && (
          <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
            <div className="flex flex-wrap gap-1.5 mt-2">
              {sensitiveFilePatterns.map((pattern) => (
                <span
                  key={pattern}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200"
                >
                  <span className="font-mono">{pattern}</span>
                  <button
                    onClick={() => setSensitiveFilePatterns(sensitiveFilePatterns.filter((p) => p !== pattern))}
                    className="text-amber-400 hover:text-amber-600"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {sensitiveFilePatterns.length === 0 && (
                <span className="text-xs text-gray-400">无过滤规则</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPatternInput}
                onChange={(e) => setNewPatternInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPatternInput.trim()) {
                    const p = newPatternInput.trim();
                    if (!sensitiveFilePatterns.includes(p)) {
                      setSensitiveFilePatterns([...sensitiveFilePatterns, p]);
                    }
                    setNewPatternInput("");
                  }
                }}
                placeholder="输入 glob 模式，如 *.key"
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <button
                onClick={() => {
                  const p = newPatternInput.trim();
                  if (p && !sensitiveFilePatterns.includes(p)) {
                    setSensitiveFilePatterns([...sensitiveFilePatterns, p]);
                  }
                  setNewPatternInput("");
                }}
                disabled={!newPatternInput.trim()}
                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus size={12} />
                添加
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500" />
        <button
          onClick={handleStartCollection}
          disabled={selectedProjects.size === 0 || resumeGeneratorState.isAnalyzing || !defaultProvider}
          className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {resumeGeneratorState.isAnalyzing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Wand2 size={16} />
              开始分析
            </>
          )}
        </button>
      </div>

      {resumeGeneratorState.isAnalyzing && (
        <div className="space-y-2">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse" style={{ width: "60%" }} />
          </div>
          <div className="text-xs text-gray-500 text-center">
            AI 正在分析项目文件...
            <button
              onClick={() => setShowProjectAnalyzer(true)}
              className="ml-2 text-blue-500 hover:text-blue-700"
            >
              查看详情
            </button>
          </div>
        </div>
      )}

      {/* 已保存的简历历史 */}
      {savedResumes.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <History size={16} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-900">历史简历</h3>
            <span className="text-xs text-gray-400">({savedResumes.length})</span>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-auto">
            {savedResumes.map((resume) => (
              <div
                key={resume.id}
                onClick={() => handleLoadResume(resume)}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {JOB_DIRECTIONS.find((d) => d.id === resume.jobDirection)?.name || resume.jobDirection}
                    </span>
                    <span className="text-xs text-gray-400">
                      {resume.experiences.length} 个项目
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(resume.updatedAt || resume.createdAt).toLocaleString("zh-CN")}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {resume.experiences.slice(0, 3).map((e) => (
                      <span key={e.projectId} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                        {e.projectName}
                      </span>
                    ))}
                    {resume.experiences.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{resume.experiences.length - 3}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteResume(e, resume.id)}
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

  // 渲染预览界面
  const renderPreview = () => {
    const currentResume = resumeGeneratorState.generatedResume;

    // 如果有生成的简历，直接显示
    if (currentResume) {
      return renderResumePreview(currentResume);
    }

    return null;
  };

  // 渲染已生成的简历预览
  const renderResumePreview = (currentResume: GeneratedResume) => {
    // 从生成的简历中提取统计信息
    const totalProjects = currentResume.experiences.length;
    const totalCommits = currentResume.experiences.reduce((sum, exp) => sum + (exp.commitStats?.totalCommits || 0), 0);
    const allTechStack = currentResume.skills || [];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-semibold text-blue-600">{totalProjects}</div>
            <div className="text-xs text-gray-600">分析项目</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-semibold text-green-600">{totalCommits}</div>
            <div className="text-xs text-gray-600">总提交数</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-semibold text-purple-600">
              {(() => {
                const timeRanges = currentResume.experiences
                  .map((e) => e.timeRange)
                  .filter((t) => t.start && t.end);
                if (timeRanges.length === 0) return "-";
                const starts = timeRanges.map((t) => new Date(t.start).getTime());
                const ends = timeRanges.map((t) => new Date(t.end).getTime());
                return formatTimeRange(
                  new Date(Math.min(...starts)).toISOString(),
                  new Date(Math.max(...ends)).toISOString()
                );
              })()}
            </div>
            <div className="text-xs text-gray-600">活跃周期</div>
          </div>
          <div className="p-4 bg-amber-50 rounded-lg">
            <div className="text-2xl font-semibold text-amber-600">{allTechStack.length}</div>
            <div className="text-xs text-gray-600">技术栈</div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">主要技术栈</h4>
          <div className="flex flex-wrap gap-2">
            {allTechStack.slice(0, 15).map((tech) => (
              <span key={tech} className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">
              项目经历
              <span className="text-xs font-normal text-gray-500 ml-2">
                {JOB_DIRECTIONS.find((d) => d.id === currentResume.jobDirection)?.name}
              </span>
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(true)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
              >
                <Eye size={14} />
                预览
              </button>
              <button
                onClick={handleGenerate}
                disabled={resumeGeneratorState.isAnalyzing}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
              >
                <RefreshCw size={14} />
                {resumeGeneratorState.isAnalyzing ? "生成中..." : "重新生成"}
              </button>
              <button
                onClick={handleSaveResume}
                className="px-3 py-1.5 text-xs border border-green-200 text-green-700 rounded-lg hover:bg-green-50 flex items-center gap-1"
              >
                <Save size={14} />
                保存
              </button>
              <button
                onClick={handleExportMarkdown}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1"
              >
                <FileDown size={14} />
                导出
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {currentResume.experiences.map((exp) => (
              <ResumeEditor
                key={exp.projectId}
                experience={exp}
                onSave={handleUpdateExperience}
                onRegenerate={() => handleRegenerateProject(exp.projectId)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="re-header sticky top-0 z-20" data-tauri-drag-region>
        <span className="toggle" onClick={onBack}>
          <ChevronLeft size={16} />
        </span>

        <div className="flex items-center gap-2 mr-4" data-tauri-drag-region>
          <FileText size={18} className="text-blue-500" />
          <span className="text-lg font-semibold">简历生成器</span>
        </div>

        <div className="flex-1" data-tauri-drag-region />

        <div className="re-actions flex items-center gap-2">
          {resumeGeneratorState.isAnalyzing && (
            <button
              onClick={() => setShowProjectAnalyzer(true)}
              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1"
            >
              <Loader2 size={14} className="animate-spin" />
              分析中...
            </button>
          )}
          {resumeGeneratorState.generatedResume && (
            <button
              onClick={handleReanalyze}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
            >
              <RefreshCw size={14} />
              重新分析
            </button>
          )}
          {resumeGeneratorState.generatedResume && (
            <div className="flex items-center gap-2 text-xs text-green-600 mr-2">
              <CheckCircle size={14} />
              已生成
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {resumeGeneratorState.generatedResume && (
          <div className="flex items-center gap-4 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("select")}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "select"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <div className="flex items-center gap-1">
                <ChevronLeft size={14} />
                重新选择
              </div>
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "preview"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              预览与编辑
            </button>
          </div>
        )}

        {activeTab === "select" ? renderProjectSelection() : renderPreview()}
      </div>

      {/* 简历预览弹窗 */}
      {showPreview && resumeGeneratorState.generatedResume && (
        <ResumePreview
          resume={resumeGeneratorState.generatedResume}
          onClose={() => setShowPreview(false)}
          onExport={handleExportMarkdown}
        />
      )}

      {/* 项目分析器 - AI 对话和文件分析 */}
      {/* 分析期间保持组件挂载，避免关闭弹窗后重新打开丢失状态 */}
      {(showProjectAnalyzer || resumeGeneratorState.isAnalyzing) && defaultProvider && (
        <ProjectAnalyzer
          isOpen={showProjectAnalyzer}
          onClose={handleCloseAnalyzer}
          projects={projects.filter((p) => selectedProjects.has(p.id))}
          jobDirection={selectedDirection}
          provider={defaultProvider}
          onComplete={handleGenerationComplete}
          onError={handleGenerationError}
          onUserCancel={handleUserCancel}
          sensitivePatterns={sensitiveFilePatterns}
        />
      )}
    </div>
  );
}
