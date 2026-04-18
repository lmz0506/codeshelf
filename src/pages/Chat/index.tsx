import { useEffect, useMemo, useRef, useState } from "react";
import { Settings, ListChecks, Brain } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { showToast } from "@/components/ui";
import { MacWindowControls } from "@/components/layout/MacWindowControls";
import {
  createChatSession,
  deleteChatSession,
  executeTool,
  getChatSession,
  listChatSessions,
  listTools,
  renameChatSession,
  saveChatSession,
} from "@/services/chat";
import { getGlobalMemory, saveGlobalMemory, readMentionFile } from "@/services/chat";
import type { ChatStreamMessage, ToolSchema } from "@/services/chat";
import type { AiModelConfig, AiProviderConfig, ChatAttachment, ChatMessage, ChatSession, ChatSessionSummary, ToolCall } from "@/types";

import { SessionSidebar } from "./components/SessionSidebar";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";
import { RenameDialog } from "./components/RenameDialog";
import { SessionConfigPanel, type SessionConfigValues } from "./components/SessionConfigPanel";
import { ToolApprovalDialog, type PendingApproval } from "./components/ToolApprovalDialog";
import { TaskPanel } from "./components/TaskPanel";
import { SkillsPicker } from "./components/SkillsPicker";
import { AtMentionPicker } from "./components/AtMentionPicker";
import { useChatStream } from "./hooks/useChatStream";
import { exportSessionAsJson, exportSessionAsMarkdown, importSessionFromJson } from "./utils/exportSession";
import { sessionTokens } from "./utils/tokens";
import { compactMessages } from "./utils/compact";
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
  const { aiProviders, setCurrentPage, ensureAiDefaultProvider, sidebarCollapsed, setSidebarCollapsed, projects } = useAppStore();

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

  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [toolSchemas, setToolSchemas] = useState<ToolSchema[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [globalMemory, setGlobalMemory] = useState<string>("");
  const [memoryEditorOpen, setMemoryEditorOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const approvalResolverRef = useRef<((d: "once" | "always" | "reject") => void) | null>(null);

  useEffect(() => {
    listTools().then(setToolSchemas).catch(() => {});
    getGlobalMemory().then(setGlobalMemory).catch(() => {});
  }, []);

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

  function requestApproval(call: ToolCall): Promise<"once" | "always" | "reject"> {
    return new Promise((resolve) => {
      approvalResolverRef.current = resolve;
      setPendingApproval({ id: call.id, name: call.name, argumentsJson: call.arguments });
    });
  }

  function handleApprovalDecision(decision: "once" | "always" | "reject") {
    const fn = approvalResolverRef.current;
    approvalResolverRef.current = null;
    setPendingApproval(null);
    fn?.(decision);
  }

  const mentionContextRef = useRef<string>("");

  /** 将 ChatSession.messages 转为 OpenAI 协议消息（含 tool_calls / tool 结果） */
  function toStreamMessages(session: ChatSession): ChatStreamMessage[] {
    const out: ChatStreamMessage[] = [];
    const sysParts: string[] = [];
    if (globalMemory.trim()) sysParts.push(`[全局记忆 MEMORY.md]\n${globalMemory.trim()}`);
    if (session.systemPrompt?.trim()) sysParts.push(session.systemPrompt.trim());
    if (mentionContextRef.current.trim()) sysParts.push(mentionContextRef.current.trim());
    if (sysParts.length) out.push({ role: "system", content: sysParts.join("\n\n---\n\n") });
    for (const m of session.messages) {
      if (m.role === "assistant") {
        const hasToolCalls = (m.toolCalls?.length ?? 0) > 0;
        if (!hasToolCalls && (!m.content || !m.content.trim())) continue;
        out.push({
          role: "assistant",
          content: m.content ?? "",
          toolCalls: hasToolCalls
            ? m.toolCalls!.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments || "{}" },
              }))
            : undefined,
        });
      } else if (m.role === "tool") {
        out.push({
          role: "tool",
          content: m.content,
          toolCallId: m.toolCallId,
          name: m.toolName,
        });
      } else if (m.role === "user" && m.attachments?.some((a) => a.kind === "image")) {
        const parts: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        > = [];
        if (m.content.trim()) parts.push({ type: "text", text: m.content });
        for (const a of m.attachments) {
          if (a.kind === "image") parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
        }
        out.push({ role: "user", content: parts });
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }

  /** 构建 OpenAI tools 参数；仅在 toolsEnabled 时返回 */
  function activeTools(session: ChatSession) {
    if (!toolsEnabled) return undefined;
    const enabled = session.enabledTools ?? toolSchemas.map((t) => t.name);
    const list = toolSchemas.filter((t) => enabled.includes(t.name));
    if (list.length === 0) return undefined;
    return list.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  const MAX_TOOL_ROUNDS = 10;

  async function runChatRequest(session: ChatSession, round: number = 0): Promise<void> {
    if (!selected) return;
    if (round >= MAX_TOOL_ROUNDS) {
      showToast("warning", `已达到最大工具循环轮次（${MAX_TOOL_ROUNDS}），请检查`);
      return;
    }
    const tools = activeTools(session);

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
          messages: toStreamMessages(session),
          tools,
        },
        {
          onDelta: (full, thinking) => {
            setActiveSession((prev) => {
              if (!prev) return prev;
              const messages = [...prev.messages];
              const last = messages[messages.length - 1];
              if (last?.role === "assistant" && !last.toolCalls) {
                messages[messages.length - 1] = {
                  ...last,
                  content: full,
                  thinkingContent: thinking || last.thinkingContent,
                };
              } else {
                messages.push(makeMessage("assistant", full, { thinkingContent: thinking || undefined }));
              }
              return { ...prev, messages };
            });
          },
          onThinking: () => {},
          onToolCallDelta: () => {},
          onDone: async (finalContent, finalThinking, toolCalls, finishReason) => {
            const current = activeSessionRef.current;
            if (!current) return;

            // 写入 assistant 消息（含 toolCalls）
            const assistantMsg: ChatMessage = makeMessage("assistant", finalContent, {
              thinkingContent: finalThinking || undefined,
              toolCalls: toolCalls.length > 0 ? toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })) : undefined,
            });
            const lastIdx = current.messages.length - 1;
            const last = current.messages[lastIdx];
            let nextMessages: ChatMessage[];
            if (last?.role === "assistant" && !last.toolCalls) {
              // 流式过程中已占位的消息，合并字段
              nextMessages = [...current.messages];
              nextMessages[lastIdx] = { ...last, ...assistantMsg, id: last.id, createdAt: last.createdAt };
            } else {
              nextMessages = [...current.messages, assistantMsg];
            }
            let updatedSession: ChatSession = { ...current, messages: nextMessages };
            if ((updatedSession.title === "新会话" || !updatedSession.title.trim()) && updatedSession.messages.length >= 2) {
              const generated = summarizeTitle(updatedSession.messages);
              if (generated) updatedSession = { ...updatedSession, title: generated };
            }
            try {
              const saved = await saveChatSession(updatedSession);
              setActiveSession(saved);
              syncSummary(saved);
              updatedSession = saved;
            } catch {
              /* ignore */
            }

            // 若本轮因 tool_calls 结束，走工具循环
            if (finishReason === "tool_calls" && toolCalls.length > 0) {
              await executeAndContinue(updatedSession, toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })), round);
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

  async function executeAndContinue(sessionAfterAssistant: ChatSession, calls: ToolCall[], round: number) {
    let session = sessionAfterAssistant;
    // 加载一次最新 allowedTools（可能用户在之前回合勾选了"始终允许"）
    let allowedTools = new Set<string>(session.allowedTools ?? []);

    for (const call of calls) {
      let approved: "once" | "always" | "reject";
      if (allowedTools.has(call.name)) {
        approved = "once";
      } else {
        approved = await requestApproval(call);
      }
      if (approved === "always") {
        allowedTools.add(call.name);
        session = { ...session, allowedTools: Array.from(allowedTools) };
        try {
          const saved = await saveChatSession(session);
          setActiveSession(saved);
          syncSummary(saved);
          session = saved;
        } catch {
          /* ignore */
        }
      }

      let resultContent: string;
      if (approved === "reject") {
        resultContent = "（用户拒绝执行此工具）";
      } else {
        try {
          resultContent = await executeTool({
            sessionId: session.id,
            toolName: call.name,
            argumentsJson: call.arguments || "{}",
          });
        } catch (err) {
          resultContent = `执行失败: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      const toolMessage: ChatMessage = makeMessage("tool", resultContent, {
        toolCallId: call.id,
        toolName: call.name,
      });
      session = { ...session, messages: [...session.messages, toolMessage] };
      try {
        const saved = await saveChatSession(session);
        setActiveSession(saved);
        syncSummary(saved);
        session = saved;
      } catch {
        /* ignore */
      }
    }

    // 全部工具已处理，递归进入下一轮
    await runChatRequest(session, round + 1);
  }

  async function resolveMentions(text: string, root: string | undefined): Promise<string> {
    if (!root) return "";
    const re = /@([A-Za-z0-9_\-./]+)/g;
    const paths = new Set<string>();
    for (const m of text.matchAll(re)) {
      paths.add(m[1]);
    }
    if (paths.size === 0) return "";
    const parts: string[] = ["[引用文件]"];
    for (const p of paths) {
      try {
        const content = await readMentionFile(root, p);
        parts.push(`\n### ${p}\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        /* 跳过无法读取的 */
      }
    }
    return parts.length > 1 ? parts.join("\n") : "";
  }

  async function handleSend() {
    if (!activeSession || !selected || streaming) return;
    if (!input.trim() && pendingAttachments.length === 0) return;
    const content = input.trim();
    mentionContextRef.current = await resolveMentions(content, activeSession.allowedCwd);
    const userMessage = makeMessage("user", content, {
      attachments: pendingAttachments.length ? pendingAttachments : undefined,
    });
    const nextSession: ChatSession = {
      ...activeSession,
      providerId: selected.providerId,
      modelId: selected.modelId,
      messages: [...activeSession.messages, userMessage],
    };
    setInput("");
    setPendingAttachments([]);
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

  async function handlePickAllowedCwd() {
    if (!activeSession) return;
    try {
      const picked = await openDialog({ directory: true, multiple: false, title: "选择允许工具操作的目录" });
      if (!picked || Array.isArray(picked)) return;
      const nextSession: ChatSession = { ...activeSession, allowedCwd: picked as string };
      await persistSession(nextSession);
      showToast("success", "已设置目录");
    } catch {
      showToast("error", "设置失败");
    }
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

  async function handleCompact() {
    if (!activeSession || !selected || streaming) return;
    if (activeSession.messages.length < 6) {
      showToast("warning", "消息太少，无需压缩");
      return;
    }
    setLoading(true);
    try {
      const newMessages = await compactMessages({
        session: activeSession,
        providerId: selected.providerId,
        model: selected.model.model,
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
      });
      const next: ChatSession = { ...activeSession, messages: newMessages };
      await persistSession(next);
      showToast("success", "已压缩");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "压缩失败");
    } finally {
      setLoading(false);
    }
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

  async function handleSlashCommand(id: SlashCommandId) {
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
      case "compact":
        await handleCompact();
        break;
      case "skills":
        setSkillsOpen(true);
        break;
      case "help":
        showToast(
          "info",
          "/clear 清空 · /new 新会话 · /export 导出 md · /system 系统提示 · /config 参数 · /regen 重生成"
        );
        break;
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <header className="re-header sticky top-0 z-20" data-tauri-drag-region>
        <span className="toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          ☰
        </span>

        <div className="flex-1 flex items-center gap-3" data-tauri-drag-region>
          <span className="text-lg font-semibold ml-2">💬 对话</span>
          {activeSession && (
            <span className="text-[11px] text-gray-400" title="估算 tokens（char/4 近似）">
              ~{sessionTokens(activeSession.messages).toLocaleString()} tokens
            </span>
          )}
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
            <>
              <label className={`px-2 py-1 text-xs rounded-lg flex items-center gap-1 cursor-pointer border ${toolsEnabled ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={toolsEnabled}
                  onChange={(e) => setToolsEnabled(e.target.checked)}
                  disabled={streaming}
                />
                🛠 工具 {toolsEnabled ? "已启用" : "未启用"}
              </label>
              <select
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 max-w-[220px]"
                value={
                  activeSession.allowedCwd &&
                  projects.find((p) => p.path === activeSession.allowedCwd)
                    ? `project:${activeSession.allowedCwd}`
                    : activeSession.allowedCwd
                      ? "custom"
                      : ""
                }
                onChange={async (e) => {
                  const v = e.target.value;
                  if (v === "") return;
                  if (v === "custom") {
                    await handlePickAllowedCwd();
                    return;
                  }
                  if (v.startsWith("project:")) {
                    const path = v.slice("project:".length);
                    const next: ChatSession = { ...activeSession, allowedCwd: path };
                    await persistSession(next);
                    showToast("success", "已绑定项目目录");
                  }
                }}
                disabled={streaming}
                title="选择项目目录或自定义目录"
              >
                <option value="">未选目录</option>
                {projects.length > 0 && (
                  <optgroup label="📚 书架项目">
                    {projects.map((p) => (
                      <option key={p.id} value={`project:${p.path}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="custom">📁 自定义目录…</option>
              </select>
              <button
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg flex items-center gap-1 text-gray-600 hover:bg-gray-50"
                onClick={() => {
                  setMemoryDraft(globalMemory);
                  setMemoryEditorOpen(true);
                }}
                title="全局记忆 MEMORY.md"
              >
                <Brain size={12} /> 记忆
              </button>
              <button
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg flex items-center gap-1 text-gray-600 hover:bg-gray-50"
                onClick={() => {
                  if (!activeSession?.allowedCwd) {
                    showToast("warning", "请先选择会话根目录");
                    return;
                  }
                  setMentionOpen(true);
                }}
                title="引用文件（@ 注入内容）"
              >
                @ 文件
              </button>
              <button
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg flex items-center gap-1 text-gray-600 hover:bg-gray-50"
                onClick={() => setSkillsOpen(true)}
                title="Skills"
              >
                📚 Skills
              </button>
              <button
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg flex items-center gap-1 text-gray-600 hover:bg-gray-50"
                onClick={() => setTaskPanelOpen((v) => !v)}
                title="任务面板"
              >
                <ListChecks size={12} /> 任务
              </button>
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
            </>
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
                onImagePaste={(dataUrl) =>
                  setPendingAttachments((prev) => [...prev, { kind: "image", dataUrl }])
                }
                attachmentsSlot={
                  pendingAttachments.length > 0 ? (
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {pendingAttachments.map((a, idx) =>
                        a.kind === "image" ? (
                          <div key={idx} className="relative w-20 h-20 border border-gray-200 rounded overflow-hidden group">
                            <img src={a.dataUrl} alt="" className="w-full h-full object-cover" />
                            <button
                              className="absolute top-0 right-0 bg-black/60 text-white text-[10px] px-1 opacity-0 group-hover:opacity-100"
                              onClick={() =>
                                setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                              }
                            >
                              ×
                            </button>
                          </div>
                        ) : null,
                      )}
                    </div>
                  ) : null
                }
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

      <ToolApprovalDialog pending={pendingApproval} onDecide={handleApprovalDecision} />

      {activeSession && (
        <TaskPanel sessionId={activeSession.id} open={taskPanelOpen} onClose={() => setTaskPanelOpen(false)} />
      )}

      <SkillsPicker
        open={skillsOpen}
        onClose={() => setSkillsOpen(false)}
        onSelect={(rendered) => setInput((prev) => (prev.trim() ? `${prev}\n\n${rendered}` : rendered))}
      />

      <AtMentionPicker
        open={mentionOpen}
        root={activeSession?.allowedCwd ?? null}
        onClose={() => setMentionOpen(false)}
        onPick={(paths) => {
          const snippet = paths.map((p) => `@${p}`).join(" ");
          setInput((prev) => (prev.trim() ? `${prev} ${snippet}` : snippet));
        }}
      />

      {memoryEditorOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[600px] max-w-[90vw] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Brain size={14} /> 全局记忆（MEMORY.md）
              </div>
              <span className="text-[11px] text-gray-400">每次对话将作为 system 消息最前置</span>
            </div>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-2 text-sm font-mono"
              rows={14}
              placeholder="例：我是 Go + React 背景，偏好简洁；代码用 2 空格缩进…"
              value={memoryDraft}
              onChange={(e) => setMemoryDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={() => setMemoryEditorOpen(false)}>
                取消
              </button>
              <button
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
                onClick={async () => {
                  try {
                    await saveGlobalMemory(memoryDraft);
                    setGlobalMemory(memoryDraft);
                    setMemoryEditorOpen(false);
                    showToast("success", "已保存");
                  } catch {
                    showToast("error", "保存失败");
                  }
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
