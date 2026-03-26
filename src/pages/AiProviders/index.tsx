import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { MessageSquare, X, Plus, Pencil, Trash2, Send, Square } from "lucide-react";
import { AiProviderSettings, type AiProviderSettingsHandle } from "@/pages/Settings/AiProviderSettings";
import { useAppStore } from "@/stores/appStore";
import { showToast } from "@/components/ui";
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
import type { AiProviderConfig, ChatMessage, ChatSession, ChatSessionSummary } from "@/types";

function getDefaultProvider(providers: AiProviderConfig[]) {
  const enabled = providers.filter((p) => p.enabled);
  if (enabled.length === 0) return null;
  return enabled.find((p) => p.isDefaultProvider) ?? enabled[0];
}

function getDefaultModel(provider: NonNullable<ReturnType<typeof getDefaultProvider>>) {
  const enabledModels = provider.models.filter((m) => m.enabled);
  if (enabledModels.length === 0) return null;
  return enabledModels.find((m) => m.isDefault) ?? enabledModels[0];
}

function buildMessage(role: ChatMessage["role"], content: string, thinkingContent?: string): ChatMessage {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    thinkingContent,
  };
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
  const streamBufferRef = useRef<string>("");
  const sessionLoadSeq = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);

  const { provider, model } = useMemo(() => {
    const normalized = ensureAiDefaultProvider(aiProviders);
    const provider = getDefaultProvider(normalized);
    const model = provider ? getDefaultModel(provider) : null;
    return { provider, model };
  }, [aiProviders, ensureAiDefaultProvider]);

  const isConfigured = Boolean(provider && model);

  useEffect(() => {
    if (showChat) {
      setShowChatFull(true);
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
      setActiveSession(null);
      try {
        const session = await getChatSession(targetId);
        if (sessionLoadSeq.current !== seq) return;
        if (activeSessionIdRef.current !== targetId) return;
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
    let unlisten: (() => void) | null = null;
    if (!showChat) return;
    listen<{ requestId: string; delta?: string; done: boolean; error?: string; thinkingDelta?: string }>("chat-stream", (event) => {
      if (!streamRequestId || event.payload.requestId !== streamRequestId) return;
      if (event.payload.error) {
        showToast("error", event.payload.error);
        setStreaming(false);
        setStreamRequestId(null);
        setThinkingVisible(false);
        streamBufferRef.current = "";
        return;
      }
      if (event.payload.thinkingDelta) {
        setThinkingBuffer((prev) => prev + event.payload.thinkingDelta);
        setThinkingVisible(true);
      }
      if (event.payload.delta) {
        streamBufferRef.current += event.payload.delta;
        setActiveSession((prev) => {
          if (!prev) return prev;
          if (prev.id !== activeSessionIdRef.current) return prev;
          const updated = { ...prev };
          const messages = [...updated.messages];
          const last = messages[messages.length - 1];
          if (last?.role === "assistant") {
            last.content = streamBufferRef.current;
            last.thinkingContent = thinkingBuffer || last.thinkingContent;
          } else {
            messages.push(buildMessage("assistant", streamBufferRef.current, thinkingBuffer));
          }
          updated.messages = messages;
          return updated;
        });
      }
      if (event.payload.done) {
        setStreaming(false);
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
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [streamRequestId, thinkingBuffer, showChat]);

  async function handleCreateSession() {
    if (!provider || !model) return;
    try {
      const session = await createChatSession({
        title: "新会话",
        providerId: provider.id,
        modelId: model.id,
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
          setThinkingVisible(false);
          setExpandedThinkingIds(new Set());
        }
        return remaining;
      });
    } catch {
      showToast("error", "删除失败");
    }
  }

  async function handleSend() {
    if (!activeSession || !provider || !model || !input.trim() || streaming) return;
    const content = input.trim();
    const userMessage = buildMessage("user", content);
    const nextSession: ChatSession = {
      ...activeSession,
      providerId: provider.id,
      modelId: model.id,
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
      streamBufferRef.current = "";

      await chatStream({
        requestId,
        providerId: provider.id,
        model: model.model,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        thinking: model.thinking,
        messages: saved.messages.map((m) => ({ role: m.role, content: m.content })),
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
    setStreamRequestId(null);
    setThinkingVisible(false);
    streamBufferRef.current = "";
  }

  useEffect(() => {
    async function persistAssistant() {
      if (!activeSession || streaming) return;
      if (activeSession.messages.length === 0) return;
      const saved = await saveChatSession(activeSession).catch(() => null);
      if (saved) {
        setSessions((prev) => prev.map((s) => (s.id === saved.id ? { ...s, updatedAt: saved.updatedAt, messageCount: saved.messages.length } : s)));
        setActiveSession(saved);
      }
    }
    persistAssistant();
  }, [streaming, activeSession]);

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
          <span className="text-lg font-semibold ml-2">✨ 模型/供应商</span>
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
            onClick={() => setShowChatFull(false)}
          />
          <div
            className={`absolute ${showChatFull ? "inset-4" : "bottom-20 right-6 w-[920px] h-[620px]"} bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-300 ${showChatFull ? "" : "pointer-events-auto"} flex flex-col`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
              <div>
                <div className="text-sm font-semibold">验证聊天</div>
                <div className="text-xs text-gray-500">用于快速验证供应商与模型是否可用</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-xs text-gray-500 hover:text-gray-800"
                  onClick={() => setShowChatFull((prev) => !prev)}
                >
                  {showChatFull ? "缩小" : "全屏"}
                </button>
                <button onClick={() => { setShowChat(false); setShowChatFull(false); }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <aside className="w-64 border-r border-gray-200 p-4 space-y-3">
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

              <main className="flex-1 flex flex-col min-h-0">
                {!isConfigured && (
                  <div className="p-6">
                    <div className="re-card p-5 space-y-3">
                      <div className="text-sm text-gray-700">尚未配置可用的 AI 供应商</div>
                      <div className="text-xs text-gray-500">请先在“模型/供应商”页面配置并启用供应商与模型。</div>
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
                        return (
                          <div key={msg.id} className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                            {!isUser && (
                              <div className="w-8 h-8 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs text-gray-600">AI</div>
                            )}
                            <div className="max-w-[70%] space-y-2">
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
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                              </div>
                            </div>
                            {isUser && (
                              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">我</div>
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
                    </div>

                    <div className="border-t border-gray-200 p-4 bg-white shrink-0">
                      <textarea
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm"
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
                      <div className="flex items-center justify-end gap-2 mt-2">
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
                            disabled={loading || !input.trim()}
                          >
                            <Send size={12} /> 发送
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </main>
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
