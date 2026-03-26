import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Plus, Pencil, Trash2, Send, Square, MessageSquare } from "lucide-react";
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

export function ChatPage() {
  const { aiProviders, setCurrentPage, ensureAiDefaultProvider } = useAppStore();
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
  const streamBufferRef = useRef<string>("");

  const { provider, model } = useMemo(() => {
    const normalized = ensureAiDefaultProvider(aiProviders);
    const provider = getDefaultProvider(normalized);
    const model = provider ? getDefaultModel(provider) : null;
    return { provider, model };
  }, [aiProviders, ensureAiDefaultProvider]);

  const isConfigured = Boolean(provider && model);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    async function loadSession() {
      if (!activeSessionId) {
        setActiveSession(null);
        return;
      }
      try {
        const session = await getChatSession(activeSessionId);
        setActiveSession(session);
      } catch {
        setActiveSession(null);
      }
    }
    loadSession();
  }, [activeSessionId]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ requestId: string; delta?: string; done: boolean; error?: string; thinkingDelta?: string }>("chat-stream", (event) => {
      if (!streamRequestId || event.payload.requestId !== streamRequestId) return;
      if (event.payload.error) {
        showToast("error", event.payload.error);
        setStreaming(false);
        setStreamRequestId(null);
        setThinkingVisible(false);
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
      }
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [streamRequestId, thinkingBuffer]);

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
    } catch {
      showToast("error", "创建会话失败");
    }
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSessionId || sessionLoading) return;
    setSessionLoading(true);
    setActiveSessionId(sessionId);
    setInput("");
    setThinkingBuffer("");
    setThinkingVisible(false);
    try {
      const session = await getChatSession(sessionId);
      setActiveSession(session);
    } catch {
      setActiveSession(null);
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleRenameSession(target: ChatSessionSummary) {
    setRenameTarget(target);
    setRenameInput(target.title);
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
      setSessions((prev) => prev.filter((s) => s.id !== target.id));
      if (activeSessionId === target.id) {
        const remaining = sessions.filter((s) => s.id !== target.id);
        const nextId = remaining[0]?.id ?? null;
        setActiveSessionId(nextId);
        if (!nextId) {
          setActiveSession(null);
        }
      }
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

  return (
    <div className="flex flex-col min-h-full">
      <header className="re-header sticky top-0 z-20" data-tauri-drag-region>
        <div className="flex-1 flex items-center gap-3" data-tauri-drag-region>
          <span className="text-lg font-semibold ml-2">💬 对话</span>
        </div>
      </header>

      <div className="flex flex-1" style={{ marginTop: "40px" }}>
        <aside className="w-72 border-r border-gray-200 p-4 space-y-3">
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
                        handleRenameSession(session);
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

        <main className="flex-1 p-5 space-y-4">
          {!isConfigured && (
            <div className="re-card p-5 space-y-3">
              <div className="text-sm text-gray-700">尚未配置可用的 AI 供应商</div>
              <div className="text-xs text-gray-500">请先在“模型/供应商”页面配置并启用供应商与模型。</div>
              <button
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
                onClick={() => setCurrentPage("aiProviders")}
              >
                去配置
              </button>
            </div>
          )}

          {isConfigured && !activeSession && (
            <div className="re-card p-5 space-y-2 text-gray-500 text-sm flex items-center gap-2">
              <MessageSquare size={16} /> 请选择或新建一个会话
            </div>
          )}

          {isConfigured && activeSession && (
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-4 overflow-auto pb-4">
                {activeSession.messages.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
                        isUser ? "bg-blue-500 text-white" : "bg-white border border-gray-200 text-gray-800"
                      }`}>
                        <div className={`text-[11px] mb-1 ${isUser ? "text-blue-100" : "text-gray-400"}`}>
                          {isUser ? "你" : "助手"}
                        </div>
                        {!isUser && msg.thinkingContent && (
                          <div className="mb-2 p-2 text-xs text-purple-600 bg-purple-50 rounded-lg">
                            <div className="font-semibold mb-1">thinking</div>
                            <div className="whitespace-pre-wrap">{msg.thinkingContent}</div>
                          </div>
                        )}
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      </div>
                    </div>
                  );
                })}
                {thinkingVisible && thinkingBuffer && (
                  <div className="flex justify-start">
                    <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-purple-50 text-purple-600 border border-purple-100">
                      <div className="text-[11px] mb-1 text-purple-400">thinking</div>
                      <div className="text-xs whitespace-pre-wrap">{thinkingBuffer}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-200 pt-3">
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm"
                  rows={3}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入你的问题..."
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
