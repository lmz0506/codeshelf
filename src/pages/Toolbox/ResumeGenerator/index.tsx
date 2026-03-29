import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText,
  Loader2,
  RefreshCw,
  CheckCircle,
  Download,
  Wand2,
  ChevronLeft,
  AlertCircle,
  Bot,
  Settings,
  Eye,
  FileDown,
  MessageSquare,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useResumeData, getTopTechStack, formatTimeRange } from "./useResumeData";
import { ResumeEditor } from "./ResumeEditor";
import { ResumePreview } from "./ResumePreview";
import { ProjectAnalyzer } from "./ProjectAnalyzer";
import { JOB_DIRECTIONS, type JobDirection, type ProjectExperience, type GeneratedResume } from "@/types/resume";
import { exportResumeToMarkdown, exportResumeToFileWithDialog } from "@/services/resume/export";
import { showToast } from "@/components/ui";

interface ResumeGeneratorProps {
  onBack: () => void;
}

export function ResumeGenerator({ onBack }: ResumeGeneratorProps) {
  const {
    projects,
    aiProviders,
    setCurrentPage,
    resumeGeneratorState,
    setResumeGeneratorData,
    setGeneratedResume,
    setResumeGeneratorDirection,
    setResumeGeneratorSelectedProjects,
    setResumeGeneratorOpen,
    setResumeGeneratorAnalyzing,
    clearResumeGeneratorState,
  } = useAppStore();

  // 从 store 恢复状态
  const [selectedDirection, setSelectedDirection] = useState<JobDirection>(
    resumeGeneratorState.selectedDirection || "backend"
  );
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set(resumeGeneratorState.selectedProjects || [])
  );
  const [activeTab, setActiveTab] = useState<"select" | "preview" | "view">(
    resumeGeneratorState.data ? "preview" : "select"
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showProjectAnalyzer, setShowProjectAnalyzer] = useState(false);
  const [isUserClosing, setIsUserClosing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { isLoading: isCollecting, progress, data, error, collectData, reset } = useResumeData({
    maxCommitsPerProject: 50,
  });

  // 组件挂载时标记为打开，恢复 store 中的数据
  useEffect(() => {
    setResumeGeneratorOpen(true);

    // 如果 store 中有数据，恢复它
    if (resumeGeneratorState.data && !data) {
      setResumeGeneratorData(resumeGeneratorState.data);
    }

    // 如果之前正在分析中，恢复分析界面
    if (resumeGeneratorState.isAnalyzing) {
      setShowProjectAnalyzer(true);
    }

    return () => {
      setResumeGeneratorOpen(false);
    };
  }, []);

  // 当本地 data 变化时，同步到 store
  useEffect(() => {
    if (data) {
      setResumeGeneratorData(data);
    }
  }, [data]);

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
    setIsUserClosing(false);
    setShowProjectAnalyzer(true);
    setResumeGeneratorAnalyzing(true);
  };

  // 重新分析
  const handleReanalyze = () => {
    reset();
    setResumeGeneratorData(null);
    setGeneratedResume(null);
    clearResumeGeneratorState();
    setActiveTab("select");
    setSelectedProjects(new Set());
    setResumeGeneratorSelectedProjects([]);
  };

  // AI 生成项目经历 - 显示对话过程
  const handleGenerate = () => {
    const resumeData = data || resumeGeneratorState.data;
    if (!resumeData || !defaultProvider) {
      showToast("error", "没有可用的 AI 供应商");
      return;
    }

    setIsUserClosing(false);
    setShowProjectAnalyzer(true);
    setResumeGeneratorAnalyzing(true);
  };

  // 处理生成完成
  const handleGenerationComplete = (resume: GeneratedResume) => {
    setGeneratedResume(resume);
    setShowProjectAnalyzer(false);
    setResumeGeneratorAnalyzing(false);
    showToast("success", "简历生成完成");
  };

  // 处理生成错误
  const handleGenerationError = (error: string) => {
    setShowProjectAnalyzer(false);
    setResumeGeneratorAnalyzing(false);
    showToast("error", error);
  };

  // 用户主动取消生成
  const handleUserCancel = () => {
    setIsUserClosing(true);
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
    const resumeData = data || resumeGeneratorState.data;
    const currentResume = resumeGeneratorState.generatedResume;
    if (!resumeData || !defaultProvider || !currentResume) return;

    const experience = resumeData.projects.find((p) => p.projectId === projectId);
    if (!experience) return;

    try {
      const direction = JOB_DIRECTIONS.find((d) => d.id === selectedDirection)!;
      const starExperience = await generateResumeWithAI.generateSingleExperience(
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
    </div>
  );

  // 渲染预览界面
  const renderPreview = () => {
    const resumeData = data || resumeGeneratorState.data;
    const currentResume = resumeGeneratorState.generatedResume;

    if (!resumeData) return null;

    const topTechStack = getTopTechStack(resumeData.overallStats.techStackFrequency, 10);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-semibold text-blue-600">
              {resumeData.overallStats.totalProjects}
            </div>
            <div className="text-xs text-gray-600">分析项目</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-semibold text-green-600">
              {resumeData.overallStats.totalCommits}
            </div>
            <div className="text-xs text-gray-600">总提交数</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-semibold text-purple-600">
              {formatTimeRange(
                resumeData.overallStats.activeTimeRange.start,
                resumeData.overallStats.activeTimeRange.end
              )}
            </div>
            <div className="text-xs text-gray-600">活跃周期</div>
          </div>
          <div className="p-4 bg-amber-50 rounded-lg">
            <div className="text-2xl font-semibold text-amber-600">
              {topTechStack.length}
            </div>
            <div className="text-xs text-gray-600">技术栈</div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">主要技术栈</h4>
          <div className="flex flex-wrap gap-2">
            {topTechStack.map(({ name, count }) => (
              <span
                key={name}
                className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
              >
                {name}
                <span className="text-gray-400 ml-1">({count})</span>
              </span>
            ))}
          </div>
        </div>

        {!currentResume ? (
          <div className="p-6 bg-gray-50 rounded-lg text-center">
            <Wand2 size={48} className="mx-auto mb-3 text-gray-400" />
            <h4 className="font-medium text-gray-900 mb-1">数据已准备好</h4>
            <p className="text-sm text-gray-500 mb-4">
              已分析 {resumeData.projects.length} 个项目，现在可以使用 AI 生成项目经历
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={resumeGeneratorState.isAnalyzing || !defaultProvider}
                className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
              >
                {resumeGeneratorState.isAnalyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <MessageSquare size={16} />
                    开始生成（显示对话）
                  </>
                )}
              </button>
            </div>
            {resumeGeneratorState.isAnalyzing && (
              <button
                onClick={() => setShowProjectAnalyzer(true)}
                className="mt-2 text-xs text-blue-500 hover:text-blue-700"
              >
                查看分析进度
              </button>
            )}
          </div>
        ) : (
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
        )}
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
          {(resumeGeneratorState.data || resumeGeneratorState.generatedResume) && (
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
        {(resumeGeneratorState.data || data) && (
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
      {showProjectAnalyzer && defaultProvider && (
        <ProjectAnalyzer
          isOpen={showProjectAnalyzer}
          onClose={handleCloseAnalyzer}
          projects={projects.filter((p) => selectedProjects.has(p.id))}
          jobDirection={selectedDirection}
          provider={defaultProvider}
          onComplete={handleGenerationComplete}
          onError={handleGenerationError}
          onUserCancel={handleUserCancel}
          isUserClosing={isUserClosing}
        />
      )}
    </div>
  );
}
