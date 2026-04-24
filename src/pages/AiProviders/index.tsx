import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { MessageSquare, X, Plus, Pencil, Trash2, Send, Square, Paperclip, FolderOpen, Filter, Check } from "lucide-react";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { readTextFile, readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { AiProviderSettings, type AiProviderSettingsHandle } from "@/pages/Settings/AiProviderSettings";
import { useAppStore } from "@/stores/appStore";
import { showToast } from "@/components/ui";
import { MacWindowControls } from "@/components/layout/MacWindowControls";
import { MarkdownRenderer } from "@/components/project/MarkdownRenderer";
import {
  chatCancel,
  chatStream,
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  renameChatSession,
  saveChatSession,
} from "@/services/chat";
import type { AiModelConfig, AiProviderConfig, ChatMessage, ChatSession, ChatSessionSummary } from "@/types";

interface ModelOption {
  providerId: string;
  providerName: string;
  modelId: string;
  model: AiModelConfig;
  baseUrl: string;
  apiKey?: string;
  key: string;
}

function buildModelOptions(providers: AiProviderConfig[]): ModelOption[] {
  const options: ModelOption[] = [];
  for (const p of providers) {
    if (!p.enabled) continue;
    for (const m of p.models) {
      if (!m.enabled) continue;
      options.push({
        providerId: p.id,
        providerName: p.name,
        modelId: m.id,
        model: m,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        key: `${p.id}:${m.id}`,
      });
    }
  }
  // Sort: default provider's default model first, then default provider's other models, then rest
  options.sort((a, b) => {
    const aProvider = providers.find((p) => p.id === a.providerId);
    const bProvider = providers.find((p) => p.id === b.providerId);
    const aIsDefaultProvider = aProvider?.isDefaultProvider ? 1 : 0;
    const bIsDefaultProvider = bProvider?.isDefaultProvider ? 1 : 0;
    if (aIsDefaultProvider !== bIsDefaultProvider) return bIsDefaultProvider - aIsDefaultProvider;
    const aIsDefault = a.model.isDefault ? 1 : 0;
    const bIsDefault = b.model.isDefault ? 1 : 0;
    if (aIsDefault !== bIsDefault) return bIsDefault - aIsDefault;
    return 0;
  });
  return options;
}

function getDefaultOptionKey(providers: AiProviderConfig[]): string | null {
  const defaultProvider = providers.filter((p) => p.enabled).find((p) => p.isDefaultProvider) ?? providers.filter((p) => p.enabled)[0];
  if (!defaultProvider) return null;
  const defaultModel = defaultProvider.models.filter((m) => m.enabled).find((m) => m.isDefault) ?? defaultProvider.models.filter((m) => m.enabled)[0];
  if (!defaultModel) return null;
  return `${defaultProvider.id}:${defaultModel.id}`;
}

function buildMessage(role: ChatMessage["role"], content: string, thinkingContent?: string, attachments?: Array<{ name: string; path: string }>): ChatMessage {
  const newVar: ChatMessage = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    thinkingContent,
    attachments: attachments?.map((a) => ({ kind: "file" as const, path: a.path, name: a.name })),
  };
  return newVar;
}

export function AiProvidersPage() {
  const { aiProviders, ensureAiDefaultProvider, sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [showChat, setShowChat] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamRequestId, setStreamRequestId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatSessionSummary | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [thinkingBuffer, setThinkingBuffer] = useState("");
  const [thinkingVisible, setThinkingVisible] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [showChatFull, setShowChatFull] = useState(true);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Set<string>>(new Set());
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; content: string; path: string; enabled: boolean }>>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [folderFilter, setFolderFilter] = useState<{ dirPath: string; show: boolean }>({ dirPath: "", show: false });
  const [filterMode, setFilterMode] = useState<"extension" | "filename">("extension");
  const [filterValue, setFilterValue] = useState("");
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef<string>("");
  const thinkingBufferRef = useRef<string>("");
  const sessionLoadSeq = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeSessionRef = useRef<ChatSession | null>(null);
  const prevStreamingRef = useRef(false);
  const streamingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const normalized = useMemo(() => ensureAiDefaultProvider(aiProviders), [aiProviders, ensureAiDefaultProvider]);
  const modelOptions = useMemo(() => buildModelOptions(normalized), [normalized]);
  const defaultKey = useMemo(() => getDefaultOptionKey(normalized), [normalized]);

  const effectiveKey = modelOptions.find((o) => o.key === selectedModelKey) ? selectedModelKey : defaultKey;
  const selected = modelOptions.find((o) => o.key === effectiveKey) ?? null;

  const isConfigured = Boolean(selected);

  useEffect(() => {
    if (showChat) {
      setShowChatFull(true);
      // 重新打开时，重新加载当前会话数据
      if (activeSessionId && !streamingRef.current) {
        getChatSession(activeSessionId).then((session) => {
          setActiveSession(session);
        }).catch(() => {});
      }
    }
  }, [showChat]);
  useEffect(() => {
    if (!showChat) return;
    async function loadSessions() {
      setListLoading(true);
      try {
        const list = await listChatSessions();
        setSessions(list);
        if (list.length > 0) {
          setActiveSessionId((prev) => (prev ? prev : list[0].id));
        }
      } catch {
        showToast("error", "加载会话失败");
      } finally {
        setListLoading(false);
      }
    }
    loadSessions();
  }, [showChat]);

  useEffect(() => {
    if (!showChat) return;
    // 流式传输期间不重新加载 session，避免清空正在接收的内容
    if (streamingRef.current) return;
    async function loadSession() {
      if (!activeSessionId) {
        setActiveSession(null);
        setSessionLoading(false);
        return;
      }
      const seq = ++sessionLoadSeq.current;
      const targetId = activeSessionId;
      activeSessionIdRef.current = targetId;
      setSessionLoading(true);
      // 只在切换到不同 session 时才清空，同一 session 保留现有数据（避免流式结束后闪烁）
      setActiveSession((prev) => {
        if (prev && prev.id !== targetId) return null;
        return prev;
      });
      try {
        const session = await getChatSession(targetId);
        if (sessionLoadSeq.current !== seq) return;
        if (activeSessionIdRef.current !== targetId) return;
        // 流式传输期间不覆盖内存中的实时数据
        if (streamingRef.current) return;
        setActiveSession(session);
      } catch {
        if (sessionLoadSeq.current !== seq) return;
        setActiveSession(null);
      } finally {
        if (sessionLoadSeq.current === seq) {
          setSessionLoading(false);
        }
      }
    }
    loadSession();
  }, [activeSessionId, showChat]);

  useEffect(() => {
    if (!showChat || !streamRequestId) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listen<{ requestId: string; delta?: string; done: boolean; error?: string; thinkingDelta?: string }>("chat-stream", (event) => {
      if (cancelled) return;
      if (event.payload.requestId !== streamRequestId) return;
      if (event.payload.error) {
        showToast("error", event.payload.error);
        setStreaming(false);
        streamingRef.current = false;
        setStreamRequestId(null);
        setThinkingVisible(false);
        streamBufferRef.current = "";
        return;
      }
      if (event.payload.thinkingDelta) {
        thinkingBufferRef.current += event.payload.thinkingDelta;
        setThinkingBuffer(thinkingBufferRef.current);
        setThinkingVisible(true);
      }
      if (event.payload.delta) {
        streamBufferRef.current += event.payload.delta;
        const currentContent = streamBufferRef.current;
        const currentThinking = thinkingBufferRef.current;
        setActiveSession((prev) => {
          if (!prev) return prev;
          if (prev.id !== activeSessionIdRef.current) return prev;
          const updated = { ...prev };
          const messages = [...updated.messages];
          const last = messages[messages.length - 1];
          if (last?.role === "assistant") {
            last.content = currentContent;
            last.thinkingContent = currentThinking || last.thinkingContent;
          } else {
            messages.push(buildMessage("assistant", currentContent, currentThinking));
          }
          updated.messages = messages;
          return updated;
        });
      }
      if (event.payload.done) {
        setStreaming(false);
        streamingRef.current = false;
        setStreamRequestId(null);
        setThinkingVisible(false);
        streamBufferRef.current = "";
        setExpandedThinkingIds((prev) => {
          if (!activeSessionIdRef.current) return prev;
          const next = new Set(prev);
          next.delete(activeSessionIdRef.current);
          return next;
        });
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [streamRequestId, showChat]);

  async function handleCreateSession() {
    if (!selected) return;
    try {
      const session = await createChatSession({
        title: "新会话",
        providerId: selected.providerId,
        modelId: selected.modelId,
      });
      setSessions((prev) => [
        {
          id: session.id,
          title: session.title,
          providerId: session.providerId,
          modelId: session.modelId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
        },
        ...prev,
      ]);
      setActiveSession(session);
      setActiveSessionId(session.id);
      setInput("");
      setThinkingBuffer("");
      thinkingBufferRef.current = "";
      setThinkingVisible(false);
      setExpandedThinkingIds(new Set());
    } catch {
      showToast("error", "创建会话失败");
    }
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSessionId || sessionLoading) return;
    setActiveSessionId(sessionId);
    setInput("");
    setThinkingBuffer("");
    thinkingBufferRef.current = "";
    setThinkingVisible(false);
    setExpandedThinkingIds(new Set());
  }

  async function handleConfirmRename() {
    if (!renameTarget) return;
    const title = renameInput.trim();
    if (!title) {
      showToast("warning", "请输入会话名称");
      return;
    }
    try {
      const updated = await renameChatSession(renameTarget.id, title);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, title: updated.title, updatedAt: updated.updatedAt } : s)));
      if (activeSession?.id === updated.id) {
        setActiveSession(updated);
      }
      setRenameTarget(null);
    } catch {
      showToast("error", "重命名失败");
    }
  }

  async function handleDeleteSession(target: ChatSessionSummary) {
    const confirmed = confirm(`确认删除会话「${target.title}」？`);
    if (!confirmed) return;
    try {
      await deleteChatSession(target.id);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== target.id);
        if (activeSessionId === target.id) {
          const nextId = remaining[0]?.id ?? null;
          setActiveSessionId(nextId);
          setActiveSession(null);
          setInput("");
          setThinkingBuffer("");
          thinkingBufferRef.current = "";
          setThinkingVisible(false);
          setExpandedThinkingIds(new Set());
        }
        return remaining;
      });
    } catch {
      showToast("error", "删除失败");
    }
  }

  async function handleAttachFiles() {
    try {
      const selected = await dialogOpen({
        multiple: true,
        title: "选择要附加的文件",
        filters: [],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const newFiles: Array<{ name: string; content: string; path: string; enabled: boolean }> = [];
      for (const filePath of paths) {
        const p = typeof filePath === "string" ? filePath : (filePath as { path: string }).path;
        try {
          const content = await readTextFile(p);
          const name = p.split("/").pop() ?? p.split("\\").pop() ?? p;
          newFiles.push({ name, content, path: p, enabled: true });
        } catch {
          showToast("warning", `无法读取文件: ${p}`);
        }
      }
      if (newFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...newFiles]);
      }
    } catch {
      showToast("error", "选择文件失败");
    }
  }

  async function handleSend() {
    if (!activeSession || !selected || (!input.trim() && attachedFiles.filter((f) => f.enabled).length === 0) || streaming) return;
    const userInput = input.trim();
    const enabledFiles = attachedFiles.filter((f) => f.enabled);

    // Build message content with file contents prepended
    let content = "";
    const attachmentMeta: Array<{ name: string; path: string }> = [];
    if (enabledFiles.length > 0) {
      for (const file of enabledFiles) {
        content += `[File: ${file.name}]\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
        attachmentMeta.push({ name: file.name, path: file.path });
      }
    }
    if (userInput) {
      content += enabledFiles.length > 0 ? `[User Message]\n${userInput}` : userInput;
    }

    const userMessage = buildMessage("user", content, undefined, attachmentMeta.length > 0 ? attachmentMeta : undefined);
    const nextSession: ChatSession = {
      ...activeSession,
      providerId: selected.providerId,
      modelId: selected.modelId,
      messages: [...activeSession.messages, userMessage],
    };
    setInput("");
    setActiveSession(nextSession);
    setLoading(true);

    try {
      const saved = await saveChatSession(nextSession);
      setActiveSession(saved);
      const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setStreamRequestId(requestId);
      setStreaming(true);
      streamingRef.current = true;
      streamBufferRef.current = "";
      thinkingBufferRef.current = "";
      setThinkingBuffer("");

      await chatStream({
        requestId,
        providerId: selected.providerId,
        model: selected.model.model,
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
        thinking: selected.model.thinking,
        stream: selected.model.stream !== false,
        messages: saved.messages
          .filter((m) => m.role !== "assistant" || m.content.trim() !== "")
          .map((m) => ({ role: m.role, content: m.content })),
      });
    } catch {
      showToast("error", "发送失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    if (!streamRequestId) return;
    await chatCancel(streamRequestId);
    setStreaming(false);
    streamingRef.current = false;
    setStreamRequestId(null);
    setThinkingVisible(false);
    streamBufferRef.current = "";
    thinkingBufferRef.current = "";
  }

  activeSessionRef.current = activeSession;

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = streaming;
    if (!wasStreaming || streaming) return;
    const session = activeSessionRef.current;
    if (!session || session.messages.length === 0) return;
    saveChatSession(session)
      .then((saved) => {
        // 保存后恢复 activeSession，防止意外丢失
        setActiveSession((prev) => {
          if (!prev || prev.id !== saved.id) return prev;
          return saved;
        });
        setSessions((prev) => prev.map((s) => (s.id === saved.id ? { ...s, updatedAt: saved.updatedAt, messageCount: saved.messages.length } : s)));
      })
      .catch(() => {});
  }, [streaming]);

  function handleCloseChat() {
    // 关闭时取消流式传输并保存当前会话
    if (streaming && streamRequestId) {
      chatCancel(streamRequestId).catch(() => {});
      setStreaming(false);
      streamingRef.current = false;
      setStreamRequestId(null);
      setThinkingVisible(false);
      streamBufferRef.current = "";
      thinkingBufferRef.current = "";
    }
    const session = activeSessionRef.current;
    if (session && session.messages.length > 0) {
      saveChatSession(session).catch(() => {});
    }
    setShowChat(false);
    setShowChatFull(false);
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, thinkingBuffer]);

  // 重新打开聊天时滚动到底部
  useEffect(() => {
    if (showChat && showChatFull) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }, 100);
    }
  }, [showChat, showChatFull]);

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAttachMenu]);

  const TEXT_EXTENSIONS = [
    "txt", "md", "json", "js", "ts", "tsx", "jsx", "py", "java",
    "c", "cpp", "h", "hpp", "rs", "go", "rb", "php", "html", "css",
    "scss", "less", "xml", "yaml", "yml", "toml", "ini", "cfg",
    "sh", "bash", "zsh", "sql", "vue", "svelte", "swift", "kt",
    "csv", "log", "env", "conf", "gitignore", "dockerfile",
  ];

  async function collectFilesFromDir(dirPath: string, extensions: string[], filenamePattern: string, mode: "extension" | "filename"): Promise<string[]> {
    const result: string[] = [];
    try {
      const entries = await readDir(dirPath);
      for (const entry of entries) {
        // Skip hidden files/directories
        if (entry.name.startsWith(".")) continue;
        const fullPath = await join(dirPath, entry.name);
        if (entry.isDirectory) {
          const sub = await collectFilesFromDir(fullPath, extensions, filenamePattern, mode);
          result.push(...sub);
        } else if (entry.isFile) {
          if (mode === "extension") {
            if (extensions.length === 0) {
              // No filter, include all text-like files
              const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
              if (TEXT_EXTENSIONS.includes(ext)) result.push(fullPath);
            } else {
              const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
              if (extensions.includes(ext)) result.push(fullPath);
            }
          } else {
            // filename mode: simple glob-like matching
            if (!filenamePattern) {
              const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
              if (TEXT_EXTENSIONS.includes(ext)) result.push(fullPath);
            } else {
              const pattern = filenamePattern.toLowerCase();
              const name = entry.name.toLowerCase();
              if (pattern.includes("*")) {
                const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
                if (regex.test(name)) result.push(fullPath);
              } else {
                if (name.includes(pattern)) result.push(fullPath);
              }
            }
          }
        }
      }
    } catch {
      // skip unreadable dirs
    }
    return result;
  }

  async function handleAttachFolder() {
    try {
      const selected = await dialogOpen({
        directory: true,
        multiple: false,
        title: "选择要附加的文件夹",
      });
      if (!selected || typeof selected !== "string") return;
      setFolderFilter({ dirPath: selected, show: true });
      setFilterMode("extension");
      setFilterValue("");
    } catch {
      showToast("error", "选择文件夹失败");
    }
  }

  async function handleConfirmFolderFilter() {
    const { dirPath } = folderFilter;
    if (!dirPath) return;

    const extensions = filterMode === "extension" && filterValue.trim()
      ? filterValue.split(",").map((s) => s.trim().toLowerCase().replace(/^\./, "")).filter(Boolean)
      : [];
    const filenamePattern = filterMode === "filename" ? filterValue.trim() : "";

    try {
      const files = await collectFilesFromDir(dirPath, extensions, filenamePattern, filterMode);
      if (files.length === 0) {
        showToast("warning", "未找到匹配的文件");
        return;
      }
      if (files.length > 50) {
        showToast("warning", `匹配到 ${files.length} 个文件，最多附加 50 个`);
      }
      // 限制每个文件 5MB，避免内存问题
      const filesToRead = files.slice(0, 50);
      const newFiles: Array<{ name: string; content: string; path: string; enabled: boolean }> = [];
      const largeFileCount = [];
      for (const p of filesToRead) {
        try {
          const content = await readTextFile(p);
          const name = p.split("/").pop() ?? p.split("\\").pop() ?? p;
          newFiles.push({ name, content, path: p, enabled: true });
          if (content.length > 5 * 1024 * 1024) {
            largeFileCount.push(name);
          }
        } catch {
          // skip unreadable files
        }
      }
      if (newFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...newFiles]);
        const msgs = [`已附加 ${newFiles.length} 个文件`];
        if (largeFileCount.length > 0) {
          msgs.push(`${largeFileCount.length} 个大文件需要较长时间加载`);
        }
        showToast("success", msgs.join("\n"));
      }
    } catch {
      showToast("error", "读取文件夹失败");
    } finally {
      setFolderFilter({ dirPath: "", show: false });
    }
  }

  function handleDeleteMessage(msgId: string) {
    if (!activeSession || streaming) return;
    const updated: ChatSession = {
      ...activeSession,
      messages: activeSession.messages.filter((m) => m.id !== msgId),
    };
    setActiveSession(updated);
    saveChatSession(updated).catch(() => {});
  }

  const settingsRef = useRef<AiProviderSettingsHandle | null>(null);

  return (
    <div className="flex flex-col min-h-full">
      <header className="re-header sticky top-0 z-20" data-tauri-drag-region>
        <span
          className="toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          ☰
        </span>
        <div className="flex flex-col" data-tauri-drag-region>
          <span className="text-lg font-semibold ml-2">✨ AI模型</span>
          <span className="text-xs text-gray-500 ml-2">统一管理 OpenAI 兼容的 AI 厂商与模型配置</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
            onClick={() => settingsRef.current?.openHistoryModal()}
          >
            会话历史路径
          </button>
          <button
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600"
            onClick={() => settingsRef.current?.openCreateDrawer()}
          >
            新增供应商
          </button>
          <MacWindowControls />
        </div>
      </header>

      <div className="p-5" style={{ marginTop: "0px" }}>
        <AiProviderSettings ref={settingsRef} />
      </div>

      <button
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-500 text-white shadow-lg flex items-center justify-center"
        onClick={() => {
          if (!showChat) setShowChat(true);
          setShowChatFull(true);
        }}
        title="验证聊天"
      >
        <MessageSquare size={18} />
      </button>

      {showChat && (
        <div className={`fixed inset-0 z-50 ${showChatFull ? "" : "pointer-events-none"}`}>
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity ${showChatFull ? "opacity-100" : "opacity-0"}`}
            onClick={handleCloseChat}
          />
          <div
            className={`absolute ${showChatFull ? "inset-4" : "bottom-20 right-6 w-[920px] h-[620px]"} bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-300 ${showChatFull ? "" : "pointer-events-auto"} flex flex-col`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-sm font-semibold">验证聊天</div>
                  <div className="text-xs text-gray-500">用于快速验证供应商与模型是否可用</div>
                </div>
                {modelOptions.length > 0 && (
                  <select
                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 max-w-[240px]"
                    value={effectiveKey ?? ""}
                    onChange={(e) => setSelectedModelKey(e.target.value)}
                    disabled={streaming}
                  >
                    {modelOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.providerName} / {opt.model.model}{opt.key === defaultKey ? "（默认）" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-xs text-gray-500 hover:text-gray-800"
                  onClick={() => setShowChatFull((prev) => !prev)}
                >
                  {showChatFull ? "缩小" : "全屏"}
                </button>
                <button onClick={handleCloseChat}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex flex-row flex-1 min-h-0">
              <aside className="w-64 shrink-0 border-r border-gray-200 p-4 space-y-3 bg-gray-50 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">会话列表</div>
                  <button
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1"
                    onClick={handleCreateSession}
                    disabled={!isConfigured}
                  >
                    <Plus size={14} /> 新建
                  </button>
                </div>

                {listLoading && (
                  <div className="text-xs text-gray-400">加载中...</div>
                )}

                <div className="space-y-2">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      className={`w-full text-left p-3 rounded-lg border ${activeSessionId === session.id ? "border-blue-400 bg-blue-50" : "border-gray-200"} ${sessionLoading ? "opacity-60" : ""}`}
                      onClick={() => handleSelectSession(session.id)}
                      disabled={sessionLoading}
                    >
                      <div className="text-sm font-medium text-gray-800">{session.title}</div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                        <span>{session.messageCount} 条</span>
                        <div className="flex items-center gap-2">
                          <span
                            className="hover:text-blue-500"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRenameTarget(session);
                              setRenameInput(session.title);
                            }}
                          >
                            <Pencil size={12} />
                          </span>
                          <span
                            className="hover:text-red-500"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteSession(session);
                            }}
                          >
                            <Trash2 size={12} />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>

              <main className="flex-1 flex flex-col min-h-0 min-w-0">
                {!isConfigured && (
                  <div className="p-6">
                    <div className="re-card p-5 space-y-3">
                      <div className="text-sm text-gray-700">尚未配置可用的 AI 供应商</div>
                      <div className="text-xs text-gray-500">请先在"AI"页面配置并启用供应商与模型。</div>
                    </div>
                  </div>
                )}

                {isConfigured && !activeSession && (
                  <div className="p-6 text-gray-500 text-sm">请选择或新建一个会话</div>
                )}

                {isConfigured && activeSession && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-auto p-6 space-y-4 min-h-0">
                      {activeSession.messages.map((msg) => {
                        const isUser = msg.role === "user";
                        const hasThinking = !isUser && Boolean(msg.thinkingContent);
                        const isExpanded = hasThinking && expandedThinkingIds.has(msg.id);
                        // Detect attachments from metadata or content pattern
                        const fileAttachments = msg.attachments ?? [];
                        const hasFiles = isUser && (fileAttachments.length > 0 || msg.content.startsWith("[File: "));
                        // Extract display content (strip file prefixes for user messages with attachments)
                        let displayContent = msg.content;
                        if (isUser && hasFiles && !msg.attachments) {
                          // Legacy: parse from content pattern
                          const userMsgMatch = msg.content.match(/\[User Message\]\n([\s\S]*)$/);
                          displayContent = userMsgMatch ? userMsgMatch[1] : msg.content;
                        } else if (isUser && msg.attachments && msg.attachments.length > 0) {
                          const userMsgMatch = msg.content.match(/\[User Message\]\n([\s\S]*)$/);
                          displayContent = userMsgMatch ? userMsgMatch[1] : msg.content.replace(/\[File: [^\]]+\]\n```[\s\S]*?```\n\n/g, "");
                        }
                        return (
                          <div key={msg.id} className={`group flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                            {isUser && !streaming && (
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity mt-2 text-gray-300 hover:text-red-500"
                                onClick={() => handleDeleteMessage(msg.id)}
                                title="删除此消息"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                            {!isUser && (
                              <div className="w-8 h-8 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs text-gray-600 shrink-0">AI</div>
                            )}
                            <div className="max-w-[70%] space-y-2">
                              {isUser && hasFiles && (
                                <div className={`flex flex-wrap gap-1 ${isUser ? "justify-end" : ""}`}>
                                  {(msg.attachments ?? []).map((att, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded">
                                      <Paperclip size={10} />
                                      {att.name}
                                    </span>
                                  ))}
                                  {!msg.attachments && hasFiles && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded">
                                      <Paperclip size={10} />
                                      附件文件
                                    </span>
                                  )}
                                </div>
                              )}
                              {hasThinking && (
                                <div className="rounded-2xl border border-purple-200 bg-purple-50 text-purple-700">
                                  <button
                                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium"
                                    onClick={() => {
                                      setExpandedThinkingIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(msg.id)) {
                                          next.delete(msg.id);
                                        } else {
                                          next.add(msg.id);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    <span>思考过程</span>
                                    <span>{isExpanded ? "收起" : "展开"}</span>
                                  </button>
                                  {isExpanded && (
                                    <div className="px-3 pb-3 text-xs whitespace-pre-wrap">{msg.thinkingContent}</div>
                                  )}
                                </div>
                              )}
                              <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                                isUser ? "bg-blue-500 text-white" : "bg-white border border-gray-200 text-gray-800"
                              }`}>
                                {isUser ? (
                                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{displayContent}</div>
                                ) : (
                                  <div className="text-sm leading-relaxed"><MarkdownRenderer content={msg.content} /></div>
                                )}
                              </div>
                            </div>
                            {isUser && (
                              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs shrink-0">我</div>
                            )}
                            {!isUser && !streaming && (
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity mt-2 text-gray-300 hover:text-red-500"
                                onClick={() => handleDeleteMessage(msg.id)}
                                title="删除此消息"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {thinkingVisible && thinkingBuffer && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs text-gray-600">AI</div>
                          <div className="max-w-[70%] rounded-2xl border border-purple-200 bg-purple-50 text-purple-700">
                            <div className="px-3 py-2 text-xs font-medium">思考过程（生成中）</div>
                            <div className="px-3 pb-3 text-xs whitespace-pre-wrap">{thinkingBuffer}</div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className="border-t border-gray-200 p-4 bg-white shrink-0">
                      {attachedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto">
                          {attachedFiles.map((file, idx) => (
                            <span
                              key={`${file.path}-${idx}`}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border cursor-pointer select-none ${
                                file.enabled
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-gray-50 text-gray-400 border-gray-200 line-through"
                              }`}
                              onClick={() => setAttachedFiles((prev) => prev.map((f, i) => i === idx ? { ...f, enabled: !f.enabled } : f))}
                              title={file.path}
                            >
                              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                file.enabled ? "bg-blue-500 border-blue-500" : "border-gray-300 bg-white"
                              }`}>
                                {file.enabled && <Check size={10} className="text-white" />}
                              </span>
                              <Paperclip size={10} />
                              <span className="max-w-[120px] truncate">{file.name}</span>
                              <button
                                className="ml-0.5 text-gray-400 hover:text-red-500"
                                onClick={(e) => { e.stopPropagation(); setAttachedFiles((prev) => prev.filter((_, i) => i !== idx)); }}
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-end gap-2">
                        <div className="relative shrink-0" ref={attachMenuRef}>
                          <button
                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                            onClick={() => setShowAttachMenu((prev) => !prev)}
                            title="附加文件/文件夹"
                            disabled={streaming}
                          >
                            <Paperclip size={18} />
                          </button>
                          {showAttachMenu && (
                            <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36 z-10">
                              <button
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => { setShowAttachMenu(false); handleAttachFiles(); }}
                              >
                                <Paperclip size={14} /> 选择文件
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => { setShowAttachMenu(false); handleAttachFolder(); }}
                              >
                                <FolderOpen size={14} /> 选择文件夹
                              </button>
                            </div>
                          )}
                        </div>
                        <textarea
                          className="flex-1 border border-gray-200 rounded-lg p-3 text-sm resize-none"
                          rows={3}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
                          placeholder="输入用于验证的内容..."
                        />
                        <div className="flex flex-col gap-1 shrink-0">
                          {streaming ? (
                            <button
                              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg flex items-center gap-1"
                              onClick={handleStop}
                            >
                              <Square size={12} /> 停止
                            </button>
                          ) : (
                            <button
                              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1 disabled:opacity-60"
                              onClick={handleSend}
                              disabled={loading || (!input.trim() && attachedFiles.filter((f) => f.enabled).length === 0)}
                            >
                              <Send size={12} /> 发送
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      )}

      {folderFilter.show && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-5 w-96 space-y-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-blue-500" />
              <div className="text-sm font-semibold">文件夹过滤</div>
            </div>
            <div className="text-xs text-gray-500 break-all">{folderFilter.dirPath}</div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg border ${filterMode === "extension" ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 text-gray-600"}`}
                  onClick={() => setFilterMode("extension")}
                >
                  按后缀过滤
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg border ${filterMode === "filename" ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 text-gray-600"}`}
                  onClick={() => setFilterMode("filename")}
                >
                  按文件名过滤
                </button>
              </div>
              <div>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder={filterMode === "extension" ? "如: ts,tsx,js（留空则包含所有文本文件）" : "如: *.test.ts 或 config（支持 * 通配符）"}
                  onKeyDown={(e) => { if (e.key === "Enter") handleConfirmFolderFilter(); }}
                />
                <div className="text-xs text-gray-400 mt-1">
                  {filterMode === "extension" ? "多个后缀用逗号分隔，留空包含所有常见文本文件" : "支持 * 通配符匹配，留空包含所有常见文本文件"}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={() => setFolderFilter({ dirPath: "", show: false })}>取消</button>
              <button className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg" onClick={handleConfirmFolderFilter}>确认</button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-80 space-y-3">
            <div className="text-sm font-semibold">重命名会话</div>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={() => setRenameTarget(null)}>取消</button>
              <button className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg" onClick={handleConfirmRename}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
