import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Bot, User, Loader2, XCircle, CheckCircle } from "lucide-react";
import { chatCancel, chatStream } from "@/services/chat";
import type { AiProviderConfig } from "@/types";
import type {
  ProjectExperience,
  JobDirectionConfig,
  STARExperience,
  GeneratedResume,
  ResumeDataSource,
  JobDirection,
} from "@/types/resume";
import { JOB_DIRECTIONS } from "@/types/resume";

interface AIConversationViewerProps {
  isOpen: boolean;
  onClose: () => void;
  dataSource: ResumeDataSource;
  jobDirection: JobDirection;
  provider: AiProviderConfig;
  onComplete: (resume: GeneratedResume) => void;
  onError: (error: string) => void;
}

interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  thinkingContent?: string;
  projectName?: string;
  status: "sending" | "streaming" | "completed" | "error";
  timestamp: number;
}

export function AIConversationViewer({
  isOpen,
  onClose,
  dataSource,
  jobDirection,
  provider,
  onComplete,
  onError,
}: AIConversationViewerProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamRequestId, setStreamRequestId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef<string>("");
  const thinkingBufferRef = useRef<string>("");
  const experiencesRef = useRef<ProjectExperience[]>([]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 开始生成
  useEffect(() => {
    if (isOpen && !isGenerating && currentProjectIndex === 0 && messages.length === 0) {
      startGeneration();
    }
  }, [isOpen]);

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
        handleError(event.payload.error);
        return;
      }

      // 处理思考过程
      if (event.payload.thinkingDelta) {
        thinkingBufferRef.current += event.payload.thinkingDelta;
        updateCurrentMessage({
          thinkingContent: thinkingBufferRef.current,
        });
      }

      // 处理内容
      if (event.payload.delta) {
        streamBufferRef.current += event.payload.delta;
        updateCurrentMessage({
          content: streamBufferRef.current,
          status: "streaming",
        });
      }

      // 完成
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

  const startGeneration = async () => {
    setIsGenerating(true);
    experiencesRef.current = [];
    await generateNextProject(0);
  };

  const generateNextProject = async (index: number) => {
    if (index >= dataSource.projects.length) {
      // 所有项目生成完成
      completeGeneration();
      return;
    }

    setCurrentProjectIndex(index);
    const project = dataSource.projects[index];
    const direction = JOB_DIRECTIONS.find((d) => d.id === jobDirection)!;

    // 构建 Prompt
    const techStack = [
      ...project.techStack,
      ...(project.dependencyAnalysis?.keyLibraries ?? []),
    ].join(", ");

    const keyCommitsDesc = project.commitStats.keyCommits
      .slice(0, 5)
      .map((c) => `- [${c.type}] ${c.message} (+${c.insertions}/-${c.deletions})`)
      .join("\n");

    const prompt = `${direction.promptTemplate.replace("{techStack}", techStack)}

【项目数据】
- 项目名称：${project.projectName}
- 项目分类：${project.category.join(", ") || "未分类"}
- 技术栈：${techStack}
- 项目架构：${project.dependencyAnalysis?.architectureHints.join(", ") || "未检测"}
- 时间跨度：${formatDate(project.timeRange.start)} - ${formatDate(project.timeRange.end)}
- 提交统计：${project.commitStats.totalCommits} 次提交，+${project.commitStats.totalInsertions}/-${project.commitStats.totalDeletions} 行代码

【关键提交记录】
${keyCommitsDesc}

【输出格式】
请严格按照以下 JSON 格式输出，不要包含任何其他内容：
{
  "situation": "项目背景描述...",
  "task": "承担的任务描述...",
  "action": "采取的技术行动描述...",
  "result": "量化结果描述..."
}

注意：
1. 必须使用给定的技术栈术语，禁止编造
2. 结果部分尽量使用量化指标（如性能提升X%、效率提高X倍）
3. 如果 commit 信息中没有具体数据，可以合理推测，但要符合后端/前端/全栈开发场景
4. 每个字段控制在 100-200 字之间`;

    // 添加用户消息
    const userMessage: ConversationMessage = {
      id: `user-${index}`,
      role: "user",
      content: `请为项目 "${project.projectName}" 生成 STAR 结构的项目经历描述...`,
      projectName: project.projectName,
      status: "completed",
      timestamp: Date.now(),
    };

    // 添加 AI 消息（等待响应）
    const assistantMessage: ConversationMessage = {
      id: `assistant-${index}`,
      role: "assistant",
      content: "",
      thinkingContent: "",
      projectName: project.projectName,
      status: "sending",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    // 清空缓冲区
    streamBufferRef.current = "";
    thinkingBufferRef.current = "";

    // 获取默认模型
    const defaultModel = provider.models.find((m) => m.isDefault && m.enabled) ??
                        provider.models.find((m) => m.enabled);

    if (!defaultModel) {
      handleError("没有可用的 AI 模型");
      return;
    }

    const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setStreamRequestId(requestId);

    try {
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
      handleError(err instanceof Error ? err.message : "启动流式请求失败");
    }
  };

  const updateCurrentMessage = (updates: Partial<ConversationMessage>) => {
    setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex < 0) return prev;
      const lastMessage = prev[lastIndex];
      if (lastMessage.role !== "assistant") return prev;

      const updated = [...prev];
      updated[lastIndex] = { ...lastMessage, ...updates };
      return updated;
    });
  };

  const handleStreamComplete = () => {
    const project = dataSource.projects[currentProjectIndex];
    const content = streamBufferRef.current;

    // 解析 JSON
    let starExperience: STARExperience = {
      situation: "",
      task: "",
      action: "",
      result: "",
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        starExperience = {
          situation: parsed.situation || "",
          task: parsed.task || "",
          action: parsed.action || "",
          result: parsed.result || "",
        };
      }
    } catch (err) {
      console.error("解析 STAR 经历失败:", err);
    }

    // 保存经历
    experiencesRef.current.push({
      ...project,
      starExperience,
      isEdited: false,
    });

    // 更新消息状态
    updateCurrentMessage({
      status: "completed",
    });

    setStreamRequestId(null);

    // 生成下一个项目
    setTimeout(() => {
      generateNextProject(currentProjectIndex + 1);
    }, 500);
  };

  const handleError = (error: string) => {
    updateCurrentMessage({
      status: "error",
      content: error,
    });
    setStreamRequestId(null);
    setIsGenerating(false);
    onError(error);
  };

  const completeGeneration = () => {
    setIsGenerating(false);

    // 生成技能总结
    const techStack = dataSource.overallStats.techStackFrequency;
    const skills = Object.entries(techStack)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);

    const resume: GeneratedResume = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      jobDirection,
      skills,
      experiences: experiencesRef.current,
      isSaved: false,
    };

    onComplete(resume);
  };

  const handleCancel = () => {
    if (streamRequestId) {
      chatCancel(streamRequestId);
    }
    setIsGenerating(false);
    setStreamRequestId(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Bot size={20} className="text-blue-600" />
              AI 生成中
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              正在分析项目 {currentProjectIndex + 1} / {dataSource.projects.length}
              {isGenerating && <span className="ml-2">{currentProjectIndex < dataSource.projects.length ? "🔄" : "✓"}</span>}
            </p>
          </div>
          <button
            onClick={handleCancel}
            disabled={!isGenerating}
            className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
          >
            <XCircle size={14} />
            取消生成
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" />
              正在初始化...
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === "user"
                    ? "bg-blue-100 text-blue-600"
                    : "bg-green-100 text-green-600"
                }`}
              >
                {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>

              {/* Content */}
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white border border-gray-200"
                }`}
              >
                {/* Project Name Badge */}
                {message.projectName && (
                  <div className="mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {message.projectName}
                    </span>
                  </div>
                )}

                {/* Status Indicator */}
                {message.role === "assistant" && message.status === "sending" && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    正在思考...
                  </div>
                )}

                {message.role === "assistant" && message.status === "streaming" && (
                  <div className="flex items-center gap-2 text-blue-500 text-xs mb-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    正在生成...
                  </div>
                )}

                {message.role === "assistant" && message.status === "completed" && (
                  <div className="flex items-center gap-2 text-green-500 text-xs mb-2">
                    <CheckCircle size={12} />
                    生成完成
                  </div>
                )}

                {/* Thinking Content (Collapsible) */}
                {message.thinkingContent && message.role === "assistant" && (
                  <div className="mb-2">
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
                        思考过程
                      </summary>
                      <div className="mt-2 p-2 bg-gray-50 rounded text-gray-500 whitespace-pre-wrap">
                        {message.thinkingContent}
                      </div>
                    </details>
                  </div>
                )}

                {/* Main Content */}
                {message.content && (
                  <div
                    className={`text-sm whitespace-pre-wrap ${
                      message.role === "user" ? "text-white" : "text-gray-700"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <StreamContent content={message.content} />
                    ) : (
                      message.content
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>使用 {provider.name} 生成中...</span>
            <span>
              {messages.filter((m) => m.role === "assistant" && m.status === "completed").length} / {dataSource.projects.length} 已完成
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${
                  (messages.filter((m) => m.role === "assistant" && m.status === "completed").length /
                    dataSource.projects.length) *
                  100
                }%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// 流式内容组件（支持代码高亮和 JSON 格式化）
function StreamContent({ content }: { content: string }) {
  // 尝试检测是否是 JSON
  const isJson = content.trim().startsWith("{") && content.trim().endsWith("}");

  if (isJson) {
    try {
      const parsed = JSON.parse(content);
      return (
        <div className="space-y-2">
          {parsed.situation && (
            <div>
              <span className="text-xs text-gray-400">【背景】</span>
              <p className="mt-0.5">{parsed.situation}</p>
            </div>
          )}
          {parsed.task && (
            <div>
              <span className="text-xs text-gray-400">【任务】</span>
              <p className="mt-0.5">{parsed.task}</p>
            </div>
          )}
          {parsed.action && (
            <div>
              <span className="text-xs text-gray-400">【行动】</span>
              <p className="mt-0.5">{parsed.action}</p>
            </div>
          )}
          {parsed.result && (
            <div>
              <span className="text-xs text-gray-400">【成果】</span>
              <p className="mt-0.5">{parsed.result}</p>
            </div>
          )}
        </div>
      );
    } catch {
      // JSON 解析失败，显示原始内容
    }
  }

  // 显示原始内容（截取前200字符）
  const displayContent = content.length > 300 ? content.slice(0, 300) + "..." : content;
  return <span>{displayContent}</span>;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}
