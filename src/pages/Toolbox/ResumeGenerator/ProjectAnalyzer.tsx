import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Bot, Loader2, XCircle, CheckCircle, FileText } from "lucide-react";
import { chatCancel, chatStream } from "@/services/chat";
import { readProjectFiles, buildProjectAnalysisPrompt } from "@/services/resume/projectFileAnalyzer";
import type { CommitAnalysisData } from "@/services/resume/projectFileAnalyzer";
import { getCommitHistory } from "@/services/git";
import { parseProjectDependencies } from "@/services/resume/dependencyParser";
import { analyzeCommits } from "./useResumeData";
import type { AiProviderConfig, Project } from "@/types";
import type { JobDirection, GeneratedResume, ProjectExperience } from "@/types/resume";

interface ProjectAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  jobDirection: JobDirection;
  provider: AiProviderConfig;
  onComplete: (resume: GeneratedResume) => void;
  onError: (error: string) => void;
  onUserCancel: () => void;
  isUserClosing: boolean;
}

interface AnalysisStep {
  id: string;
  projectId: string;
  projectName: string;
  status: "pending" | "reading_files" | "analyzing" | "streaming" | "completed" | "error";
  message?: string;
  aiResponse?: string;
  thinkingContent?: string;
  result?: {
    techStack: string[];
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  timestamp: number;
}

export function ProjectAnalyzer({
  isOpen,
  onClose,
  projects,
  jobDirection,
  provider,
  onComplete,
  onError,
  onUserCancel,
  isUserClosing,
}: ProjectAnalyzerProps) {
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [streamRequestId, setStreamRequestId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef<string>("");
  const thinkingBufferRef = useRef<string>("");
  const resultsRef = useRef<Map<string, AnalysisStep["result"]>>(new Map());
  const commitDataRef = useRef<Map<string, CommitAnalysisData>>(new Map());

  // 初始化步骤
  useEffect(() => {
    if (isOpen && steps.length === 0) {
      const initialSteps: AnalysisStep[] = projects.map((p, index) => ({
        id: `step-${p.id}`,
        projectId: p.id,
        projectName: p.name,
        status: index === 0 ? "reading_files" : "pending",
        timestamp: Date.now(),
      }));
      setSteps(initialSteps);
      // 开始分析第一个项目
      analyzeProject(0);
    }
  }, [isOpen, projects]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps, currentIndex]);

  // 监听流式消息
  useEffect(() => {
    if (!streamRequestId) return;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listen<{
      requestId: string;
      delta?: string;
      done: boolean;
      error?: string;
      thinkingDelta?: string;
    }>("chat-stream", (event) => {
      if (cancelled) return;
      if (event.payload.requestId !== streamRequestId) return;

      if (event.payload.error) {
        handleStreamError(event.payload.error);
        return;
      }

      if (event.payload.thinkingDelta) {
        thinkingBufferRef.current += event.payload.thinkingDelta;
        updateCurrentStep({
          thinkingContent: thinkingBufferRef.current,
          status: "analyzing",
        });
      }

      if (event.payload.delta) {
        streamBufferRef.current += event.payload.delta;
        updateCurrentStep({
          aiResponse: streamBufferRef.current,
          status: "streaming",
        });
      }

      if (event.payload.done) {
        handleStreamComplete();
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [streamRequestId]);

  // 分析单个项目
  const analyzeProject = async (index: number) => {
    if (index >= projects.length) {
      // 所有项目分析完成，直接完成生成
      completeGeneration();
      return;
    }

    setCurrentIndex(index);
    const project = projects[index];

    // 更新状态为读取文件
    updateStep(index, { status: "reading_files" });

    try {
      // 1. 并行读取项目文件、获取提交历史和解析依赖
      const [fileAnalysis, commits, dependencyAnalysis] = await Promise.all([
        readProjectFiles(project),
        getCommitHistory(project.path, 50).catch(() => []),
        parseProjectDependencies(project.path).catch(() => null),
      ]);

      // 2. 分析提交数据
      let commitData: CommitAnalysisData | undefined;
      if (commits.length > 0) {
        const commitStats = analyzeCommits(commits);
        const dates = commits.map((c) => new Date(c.date));
        const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const latestDate = new Date(Math.max(...dates.map((d) => d.getTime())));

        commitData = {
          ...commitStats,
          timeRange: {
            start: earliestDate.toISOString(),
            end: latestDate.toISOString(),
          },
          dependencyAnalysis,
        };
        commitDataRef.current.set(project.id, commitData);
      }

      // 3. 合并依赖分析到技术栈
      if (dependencyAnalysis) {
        if (dependencyAnalysis.framework && !fileAnalysis.techStack.includes(dependencyAnalysis.framework)) {
          fileAnalysis.techStack.push(dependencyAnalysis.framework);
        }
        if (dependencyAnalysis.language) {
          dependencyAnalysis.language.split(" / ").forEach((lang) => {
            if (!fileAnalysis.techStack.includes(lang)) {
              fileAnalysis.techStack.push(lang);
            }
          });
        }
      }

      // 4. 更新状态为分析中
      updateStep(index, {
        status: "analyzing",
        message: `已读取 ${fileAnalysis.files.length} 个文件${commits.length > 0 ? `，${commits.length} 条提交` : ""}`,
      });

      // 5. 构建 Prompt（包含 commit 数据）
      const prompt = buildProjectAnalysisPrompt(fileAnalysis, jobDirection, commitData);

      // 6. 清空缓冲区
      streamBufferRef.current = "";
      thinkingBufferRef.current = "";

      // 7. 获取默认模型
      const defaultModel = provider.models.find((m) => m.isDefault && m.enabled) ??
                          provider.models.find((m) => m.enabled);

      if (!defaultModel) {
        handleStreamError("没有可用的 AI 模型");
        return;
      }

      // 8. 发送流式请求
      const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setStreamRequestId(requestId);

      await chatStream({
        requestId,
        providerId: provider.id,
        model: defaultModel.model,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        thinking: defaultModel.thinking,
        stream: true,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        maxTokens: 2000,
      });
    } catch (err) {
      handleStreamError(err instanceof Error ? err.message : "读取文件失败");
    }
  };

  const updateStep = (index: number, updates: Partial<AnalysisStep>) => {
    setSteps((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const updateCurrentStep = (updates: Partial<AnalysisStep>) => {
    updateStep(currentIndex, updates);
  };

  const handleStreamComplete = () => {
    const content = streamBufferRef.current;

    // 解析项目分析结果
    let result: AnalysisStep["result"] = {
      techStack: [],
      situation: "",
      task: "",
      action: "",
      result: "",
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          techStack: parsed.techStack || [],
          situation: parsed.situation || "",
          task: parsed.task || "",
          action: parsed.action || "",
          result: parsed.result || "",
        };
      }
    } catch (err) {
      console.error("解析项目结果失败:", err);
    }

    resultsRef.current.set(projects[currentIndex].id, result);

    updateCurrentStep({
      status: "completed",
      result,
    });

    setStreamRequestId(null);

    // 分析下一个项目
    setTimeout(() => {
      analyzeProject(currentIndex + 1);
    }, 300);
  };

  const handleStreamError = (error: string) => {
    updateCurrentStep({
      status: "error",
      message: error,
    });
    setStreamRequestId(null);
    onError(error);
  };

  const completeGeneration = () => {
    setIsComplete(true);
    setStreamRequestId(null);

    // 构建最终的简历数据
    const experiences: ProjectExperience[] = projects.map((project) => {
      const result = resultsRef.current.get(project.id);
      const commitData = commitDataRef.current.get(project.id);
      return {
        projectId: project.id,
        projectName: project.name,
        path: project.path,
        category: project.tags,
        labels: project.labels,
        techStack: result?.techStack || project.labels,
        dependencyAnalysis: commitData?.dependencyAnalysis ?? undefined,
        timeRange: commitData?.timeRange ?? {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        commitStats: commitData
          ? {
              totalCommits: commitData.totalCommits,
              totalInsertions: commitData.totalInsertions,
              totalDeletions: commitData.totalDeletions,
              keyCommits: commitData.keyCommits,
            }
          : {
              totalCommits: 0,
              totalInsertions: 0,
              totalDeletions: 0,
              keyCommits: [],
            },
        starExperience: result
          ? {
              situation: result.situation,
              task: result.task,
              action: result.action,
              result: result.result,
            }
          : undefined,
        isEdited: false,
      };
    });

    // 收集所有技术栈
    const allTechStack = new Set<string>();
    experiences.forEach((exp) => {
      exp.techStack.forEach((tech) => allTechStack.add(tech));
    });

    const resume: GeneratedResume = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      jobDirection,
      skills: Array.from(allTechStack),
      experiences,
      isSaved: false,
    };

    onComplete(resume);
  };

  // 处理关闭 - 区分用户主动取消 vs 菜单切换
  const handleClose = () => {
    if (isUserClosing) {
      // 用户主动点击取消，停止分析
      if (streamRequestId) {
        chatCancel(streamRequestId);
      }
      onUserCancel();
    } else {
      // 菜单切换导致关闭，只隐藏界面，继续分析
      onClose();
    }
  };

  // 监听 isUserClosing 变化 - 如果变为 true 表示用户主动取消
  useEffect(() => {
    if (isUserClosing && streamRequestId) {
      chatCancel(streamRequestId);
      onUserCancel();
    }
  }, [isUserClosing, streamRequestId, onUserCancel]);

  if (!isOpen) return null;

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Bot size={20} className="text-blue-600" />
              项目分析中
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              正在分析项目 {currentIndex + 1} / {projects.length}
              <span className="ml-2">{completedCount >= projects.length ? "✓" : "🔄"}</span>
            </p>
          </div>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1"
          >
            <XCircle size={14} />
            取消
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>总体进度</span>
            <span>{completedCount} / {projects.length} 项目完成</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {steps.map((step, index) => (
            <ProjectAnalysisCard
              key={step.id}
              step={step}
              isCurrent={index === currentIndex}
              isPending={index > currentIndex}
            />
          ))}

          {isComplete && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-600" />
                <div>
                  <div className="font-medium text-green-900">简历生成完成！</div>
                  <div className="text-sm text-green-600">所有项目分析完成，可以查看和编辑</div>
                </div>
              </div>            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>    </div>
  );
}

function ProjectAnalysisCard({
  step,
  isCurrent,
  isPending,
}: {
  step: AnalysisStep;
  isCurrent: boolean;
  isPending: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const getStatusIcon = () => {
    switch (step.status) {
      case "pending":
        return <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">{step.projectName[0]}</div>;
      case "reading_files":
      case "analyzing":
      case "streaming":
        return <Loader2 size={18} className="text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle size={18} className="text-green-500" />;
      case "error":
        return <XCircle size={18} className="text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (step.status) {
      case "pending":
        return "等待分析";
      case "reading_files":
        return "读取项目文件...";
      case "analyzing":
        return "AI 分析中...";
      case "streaming":
        return "接收生成内容...";
      case "completed":
        return "分析完成";
      case "error":
        return "分析失败";
    }
  };

  if (isPending) {
    return (
      <div className="p-3 bg-gray-50 rounded-lg opacity-50">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <span className="text-sm text-gray-500">{step.projectName}</span>
        </div>      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border ${isCurrent ? "bg-white border-blue-300 shadow-sm" : "bg-gray-50 border-gray-200"}`}>
      <div className="flex items-start gap-3">
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">{step.projectName}</span>
            <span className="text-xs text-gray-500">{getStatusText()}</span>          </div>

          {step.message && (
            <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
              <FileText size={12} />
              {step.message}
            </div>          )}

          {/* 思考过程 */}
          {step.thinkingContent && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                AI 思考过程
              </summary>
              <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-auto">
                {step.thinkingContent}
              </div>            </details>
          )}

          {/* AI 响应 */}
          {step.aiResponse && (
            <div className="mt-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {showDetails ? "隐藏详情" : "查看生成内容"}
              </button>
              {showDetails && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm">
                  {step.result ? (
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500">技术栈：</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {step.result.techStack.map((tech) => (
                            <span key={tech} className="px-1.5 py-0.5 bg-white rounded text-xs">
                              {tech}
                            </span>                          ))}
                        </div>                      </div>
                      <div>
                        <span className="text-xs text-gray-500">背景：</span>
                        <p className="mt-0.5 text-gray-700">{step.result.situation}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">任务：</span>
                        <p className="mt-0.5 text-gray-700">{step.result.task}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">行动：</span>
                        <p className="mt-0.5 text-gray-700">{step.result.action}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">成果：</span>
                        <p className="mt-0.5 text-gray-700">{step.result.result}</p>
                      </div>                    </div>                  ) : (
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap">{step.aiResponse.slice(0, 500)}...</pre>                  )}
                </div>              )}
            </div>          )}
        </div>      </div>    </div>
  );
}
