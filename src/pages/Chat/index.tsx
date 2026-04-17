import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { showToast } from "@/components/ui";
import { MacWindowControls } from "@/components/layout/MacWindowControls";
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  renameChatSession,
  saveChatSession,
} from "@/services/chat";
import type { AiModelConfig, AiProviderConfig, ChatMessage, ChatSession, ChatSessionSummary } from "@/types";

import { SessionSidebar } from "./components/SessionSidebar";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";
import { RenameDialog } from "./components/RenameDialog";
import { SessionConfigPanel, type SessionConfigValues } from "./components/SessionConfigPanel";
import { useChatStream } from "./hooks/useChatStream";
import { exportSessionAsJson, exportSessionAsMarkdown, importSessionFromJson } from "./utils/exportSession";
import { type SlashCommandId } from "./utils/slashCommands";

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
  const defaultProvider =
    providers.filter((p) => p.enabled).find((p) => p.isDefaultProvider) ?? providers.filter((p) => p.enabled)[0];
  if (!defaultProvider) return null;
  const defaultModel =
    defaultProvider.models.filter((m) => m.enabled).find((m) => m.isDefault) ?? defaultProvider.models.filter((m) => m.enabled)[0];
  if (!defaultModel) return null;
  return `${defaultProvider.id}:${defaultModel.id}`;
}

function makeMessage(role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function summarizeTitle(messages: ChatMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim());
  if (!firstUser) return null;
  const trimmed = firstUser.content.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 20) + (trimmed.length > 20 ? "..." : "");
}

export function ChatPage() {
  const { aiProviders, setCurrentPage, ensureAiDefaultProvider, sidebarCollapsed, setSidebarCollapsed } = useAppStore();

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatSessionSummary | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configFocus, setConfigFocus] = useState<"system" | "params" | undefined>(undefined);

  const activeSessionRef = useRef<ChatSession | null>(null);
  activeSessionRef.current = activeSession;
  const modelSelectRef = useRef<HTMLSelectElement>(null);

  const { streaming, thinkingBuffer, start: startStream, stop: stopStream } = useChatStream();

  const normalized = useMemo(() => ensureAiDefaultProvider(aiProviders), [aiProviders, ensureAiDefaultProvider]);
  const modelOptions = useMemo(() => buildModelOptions(normalized), [normalized]);
  const defaultKey = useMemo(() => getDefaultOptionKey(normalized), [normalized]);

  const effectiveKey = modelOptions.find((o) => o.key === selectedModelKey) ? selectedModelKey : defaultKey;
  const selected = modelOptions.find((o) => o.key === effectiveKey) ?? null;
  const isConfigured = Boolean(selected);

  const userHistory = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.messages
      .filter((m) => m.role === "user" && m.content.trim())
      .map((m) => m.content)
      .reverse();
  }, [activeSession]);

  // 加载会话列表
  useEffect(() => {
    async function load() {
      setListLoading(true);
      try {
        const list = await listChatSessions();
        setSessions(list);
        if (list.length > 0) {
          setActiveSessionId((prev) => prev ?? list[0].id);
        }
      } catch {
        showToast("error", "加载会话失败");
      } finally {
        setListLoading(false);
      }
    }
    load();
  }, []);

  // 加载选中会话
  useEffect(() => {
    async function load() {
      if (!activeSessionId) {
        setActiveSession(null);
        return;
      }
      setSessionLoading(true);
      try {
        const session = await getChatSession(activeSessionId);
        setActiveSession(session);
      } catch {
        setActiveSession(null);
      } finally {
        setSessionLoading(false);
      }
    }
    load();
  }, [activeSessionId]);

  // 组件卸载时保存当前会话
  useEffect(() => {
    return () => {
      const session = activeSessionRef.current;
      if (session && session.messages.length > 0) {
        saveChatSession(session).catch(() => {});
      }
    };
  }, []);

  function syncSummary(session: ChatSession) {
    setSessions((prev) => {
      const exists = prev.find((s) => s.id === session.id);
      const summary: ChatSessionSummary = {
        id: session.id,
        title: session.title,
        providerId: session.providerId,
        modelId: session.modelId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        pinned: session.pinned,
      };
      if (exists) return prev.map((s) => (s.id === session.id ? summary : s));
      return [summary, ...prev];
    });
  }

  async function persistSession(session: ChatSession): Promise<ChatSession> {
    const saved = await saveChatSession(session);
    setActiveSession(saved);
    syncSummary(saved);
    return saved;
  }

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
          pinned: session.pinned,
        },
        ...prev,
      ]);
      setActiveSession(session);
      setActiveSessionId(session.id);
      setInput("");
    } catch {
      showToast("error", "创建会话失败");
    }
  }

  async function handleSelectSession(id: string) {
    if (id === activeSessionId || sessionLoading) return;
    setActiveSessionId(id);
    setInput("");
  }

  async function handleRenameSession(session: ChatSessionSummary) {
    setRenameTarget(session);
  }

  async function confirmRename(title: string) {
    if (!renameTarget) return;
    try {
      const updated = await renameChatSession(renameTarget.id, title);
      syncSummary(updated);
      if (activeSession?.id === updated.id) setActiveSession(updated);
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
        if (!nextId) setActiveSession(null);
      }
    } catch {
      showToast("error", "删除失败");
    }
  }

  async function handleTogglePin(target: ChatSessionSummary) {
    try {
      const full = activeSession?.id === target.id ? activeSession : await getChatSession(target.id);
      const next: ChatSession = { ...full, pinned: !full.pinned };
      await persistSession(next);
    } catch {
      showToast("error", "操作失败");
    }
  }

  async function handleExport(target: ChatSessionSummary) {
    try {
      const full = activeSession?.id === target.id ? activeSession : await getChatSession(target.id);
      const ok = await exportSessionAsMarkdown(full);
      if (ok) showToast("success", "已导出为 Markdown");
    } catch {
      showToast("error", "导出失败");
    }
  }

  async function handleImport() {
    try {
      const parsed = await importSessionFromJson();
      if (!parsed) return;
      const saved = await saveChatSession(parsed);
      syncSummary(saved);
      setActiveSessionId(saved.id);
      showToast("success", "导入成功");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "导入失败");
    }
  }

  async function runChatRequest(session: ChatSession) {
    if (!selected) return;
    const baseMessages = session.messages
      .filter((m) => m.role !== "assistant" || m.content.trim() !== "")
      .map((m) => ({ role: m.role, content: m.content }));
    const payload = session.systemPrompt?.trim()
      ? [{ role: "system" as const, content: session.systemPrompt.trim() }, ...baseMessages]
      : baseMessages;

    try {
      await startStream(
        {
          providerId: selected.providerId,
          model: selected.model.model,
          baseUrl: selected.baseUrl,
          apiKey: selected.apiKey,
          thinking: selected.model.thinking,
          stream: selected.model.stream !== false,
          temperature: session.temperature,
          maxTokens: session.maxTokens,
          topP: session.topP,
          frequencyPenalty: session.frequencyPenalty,
          presencePenalty: session.presencePenalty,
          messages: payload,
        },
        {
          onDelta: (full, thinking) => {
            setActiveSession((prev) => {
              if (!prev) return prev;
              const messages = [...prev.messages];
              const last = messages[messages.length - 1];
              if (last?.role === "assistant") {
                messages[messages.length - 1] = { ...last, content: full, thinkingContent: thinking || last.thinkingContent };
              } else {
                messages.push(makeMessage("assistant", full, { thinkingContent: thinking || undefined }));
              }
              return { ...prev, messages };
            });
          },
          onThinking: () => {
            // thinkingBuffer 由 hook 提供，用于非 assistant 末尾的展示；
            // 若已经有 assistant 占位，则在 onDelta 里更新 thinkingContent。
          },
          onDone: async () => {
            const session = activeSessionRef.current;
            if (!session) return;
            let toSave = session;
            // 自动生成标题
            if ((toSave.title === "新会话" || !toSave.title.trim()) && toSave.messages.length >= 2) {
              const generated = summarizeTitle(toSave.messages);
              if (generated) toSave = { ...toSave, title: generated };
            }
            try {
              const saved = await saveChatSession(toSave);
              setActiveSession(saved);
              syncSummary(saved);
            } catch {
              /* ignore */
            }
          },
          onError: (msg) => {
            showToast("error", msg);
          },
        }
      );
    } catch {
      showToast("error", "发送失败");
    }
  }

  async function handleSend() {
    if (!activeSession || !selected || !input.trim() || streaming) return;
    const content = input.trim();
    const userMessage = makeMessage("user", content);
    const nextSession: ChatSession = {
      ...activeSession,
      providerId: selected.providerId,
      modelId: selected.modelId,
      messages: [...activeSession.messages, userMessage],
    };
    setInput("");
    setLoading(true);
    try {
      const saved = await persistSession(nextSession);
      await runChatRequest(saved);
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    await stopStream();
    const session = activeSessionRef.current;
    if (session && session.messages.length > 0) {
      try {
        const saved = await saveChatSession(session);
        setActiveSession(saved);
        syncSummary(saved);
      } catch {
        /* ignore */
      }
    }
  }

  async function handleDeleteMessage(msg: ChatMessage) {
    if (!activeSession || streaming) return;
    const updated: ChatSession = {
      ...activeSession,
      messages: activeSession.messages.filter((m) => m.id !== msg.id),
    };
    await persistSession(updated);
  }

  function handleCopyMessage(msg: ChatMessage) {
    try {
      navigator.clipboard.writeText(msg.content);
      showToast("success", "已复制");
    } catch {
      showToast("error", "复制失败");
    }
  }

  async function handleEditUserMessage(msg: ChatMessage, newContent: string) {
    if (!activeSession || !selected || streaming) return;
    const idx = activeSession.messages.findIndex((m) => m.id === msg.id);
    if (idx < 0) return;
    const truncated = activeSession.messages.slice(0, idx);
    const edited: ChatMessage = { ...msg, content: newContent, edited: true, createdAt: new Date().toISOString() };
    const nextSession: ChatSession = {
      ...activeSession,
      messages: [...truncated, edited],
    };
    const saved = await persistSession(nextSession);
    await runChatRequest(saved);
  }

  async function handleRegenerateAssistant(msg: ChatMessage) {
    if (!activeSession || !selected || streaming) return;
    const idx = activeSession.messages.findIndex((m) => m.id === msg.id);
    if (idx < 0) return;
    const truncated = activeSession.messages.slice(0, idx);
    const nextSession: ChatSession = { ...activeSession, messages: truncated };
    const saved = await persistSession(nextSession);
    await runChatRequest(saved);
  }

  async function handleClearMessages() {
    if (!activeSession) return;
    const cleared: ChatSession = { ...activeSession, messages: [] };
    await persistSession(cleared);
    showToast("success", "已清空当前会话");
  }

  async function handleSaveConfig(values: SessionConfigValues) {
    if (!activeSession) return;
    const nextSession: ChatSession = {
      ...activeSession,
      systemPrompt: values.systemPrompt.trim() || undefined,
      temperature: values.temperature ?? undefined,
      maxTokens: values.maxTokens ?? undefined,
      topP: values.topP ?? undefined,
      frequencyPenalty: values.frequencyPenalty ?? undefined,
      presencePenalty: values.presencePenalty ?? undefined,
    };
    await persistSession(nextSession);
    setConfigOpen(false);
    showToast("success", "设置已保存");
  }

  const handleSlashCommand = useCallback(
    async (id: SlashCommandId) => {
      switch (id) {
        case "clear":
          await handleClearMessages();
          break;
        case "new":
          await handleCreateSession();
          break;
        case "export": {
          const s = activeSessionRef.current;
          if (!s) return;
          try {
            if (await exportSessionAsMarkdown(s)) showToast("success", "已导出为 Markdown");
          } catch {
            showToast("error", "导出失败");
          }
          break;
        }
        case "exportJson": {
          const s = activeSessionRef.current;
          if (!s) return;
          try {
            if (await exportSessionAsJson(s)) showToast("success", "已导出为 JSON");
          } catch {
            showToast("error", "导出失败");
          }
          break;
        }
        case "import":
          await handleImport();
          break;
        case "system":
          setConfigFocus("system");
          setConfigOpen(true);
          break;
        case "config":
          setConfigFocus("params");
          setConfigOpen(true);
          break;
        case "model":
          modelSelectRef.current?.focus();
          break;
        case "regenerate": {
          const session = activeSessionRef.current;
          if (!session) return;
          const last = [...session.messages].reverse().find((m) => m.role === "assistant");
          if (!last) {
            showToast("warning", "没有可重新生成的消息");
            return;
          }
          await handleRegenerateAssistant(last);
          break;
        }
        case "help":
          showToast(
            "info",
            "/clear 清空 · /new 新会话 · /export 导出 md · /system 系统提示 · /config 参数 · /regen 重生成"
          );
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSession]
  );

  return (
    <div className="flex flex-col min-h-full">
      <header className="re-header sticky top-0 z-20" data-tauri-drag-region>
        <span className="toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          ☰
        </span>

        <div className="flex-1 flex items-center gap-3" data-tauri-drag-region>
          <span className="text-lg font-semibold ml-2">💬 对话</span>
          {modelOptions.length > 0 && (
            <select
              ref={modelSelectRef}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 max-w-[240px]"
              value={effectiveKey ?? ""}
              onChange={(e) => setSelectedModelKey(e.target.value)}
              disabled={streaming}
            >
              {modelOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.providerName} / {opt.model.model}
                  {opt.key === defaultKey ? "（默认）" : ""}
                </option>
              ))}
            </select>
          )}
          {activeSession && (
            <button
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg flex items-center gap-1 text-gray-600 hover:bg-gray-50"
              onClick={() => {
                setConfigFocus(undefined);
                setConfigOpen(true);
              }}
              title="会话设置"
            >
              <Settings size={12} /> 设置
            </button>
          )}
        </div>

        <div className="re-actions flex items-center">
          <MacWindowControls />
        </div>
      </header>

      <div className="flex flex-1" style={{ marginTop: "40px" }}>
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          isSwitching={sessionLoading}
          isConfigured={isConfigured}
          loading={listLoading}
          onCreate={handleCreateSession}
          onImport={handleImport}
          onSelect={handleSelectSession}
          onRename={handleRenameSession}
          onDelete={handleDeleteSession}
          onTogglePin={handleTogglePin}
          onExport={handleExport}
        />

        <main className="flex-1 p-5 space-y-4 min-h-0">
          {!isConfigured && (
            <div className="re-card p-5 space-y-3">
              <div className="text-sm text-gray-700">尚未配置可用的 AI 供应商</div>
              <div className="text-xs text-gray-500">请先在"AI"页面配置并启用供应商与模型。</div>
              <button
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
                onClick={() => setCurrentPage("aiProviders")}
              >
                去配置
              </button>
            </div>
          )}

          {isConfigured && !activeSession && (
            <div className="re-card p-5 space-y-2 text-gray-500 text-sm">请选择或新建一个会话</div>
          )}

          {isConfigured && activeSession && (
            <div className="flex flex-col h-full">
              {activeSession.systemPrompt && (
                <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3 truncate">
                  <span className="font-semibold text-gray-600">System:</span> {activeSession.systemPrompt}
                </div>
              )}
              <MessageList
                messages={activeSession.messages}
                streaming={streaming}
                thinkingBuffer={thinkingBuffer}
                onCopy={handleCopyMessage}
                onEditUser={handleEditUserMessage}
                onRegenerateAssistant={handleRegenerateAssistant}
                onDelete={handleDeleteMessage}
              />
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                onStop={handleStop}
                onSlashCommand={handleSlashCommand}
                streaming={streaming}
                disabled={loading}
                userHistory={userHistory}
              />
            </div>
          )}
        </main>
      </div>

      <RenameDialog
        open={Boolean(renameTarget)}
        initialValue={renameTarget?.title ?? ""}
        onCancel={() => setRenameTarget(null)}
        onConfirm={confirmRename}
      />

      <SessionConfigPanel
        open={configOpen}
        session={activeSession}
        focus={configFocus}
        onClose={() => setConfigOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
