import { useRef, useState } from "react";
import { useChatStream } from "@/pages/Chat/hooks/useChatStream";
import type { ChatStreamMessage } from "@/services/chat";
import { saveApiChatSession } from "@/services/api_chat";
import {
  buildMcpFunctionTools,
  dispatchViaMcp,
  extractApiToolMetadata,
  runToolLoop,
} from "@/services/mcp/toolLoop";
import { mcpClient } from "@/services/mcp/client";
import type { ApiChatSession, ChatMessage } from "@/types";

interface LlmContext {
  providerId: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  thinking?: boolean;
  stream?: boolean;
}

interface RunArgs {
  session: ApiChatSession;
  llm: LlmContext;
  onSession: (s: ApiChatSession) => void;
  onError: (msg: string) => void;
}

function makeMessage(role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function toStreamMessages(session: ApiChatSession): ChatStreamMessage[] {
  const out: ChatStreamMessage[] = [];
  if (session.systemPrompt?.trim()) {
    out.push({ role: "system", content: session.systemPrompt.trim() });
  }
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
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export function useApiChatOrchestration() {
  const { streaming, thinkingBuffer, start, stop } = useChatStream();
  const [loading, setLoading] = useState(false);
  const currentSessionRef = useRef<ApiChatSession | null>(null);
  const onSessionRef = useRef<((s: ApiChatSession) => void) | null>(null);
  const onErrorRef = useRef<((msg: string) => void) | null>(null);

  async function persist(session: ApiChatSession): Promise<ApiChatSession> {
    const saved = await saveApiChatSession(session);
    currentSessionRef.current = saved;
    onSessionRef.current?.(saved);
    return saved;
  }

  async function runLoop(session: ApiChatSession, llm: LlmContext): Promise<void> {
    if (session.selectedEndpointIds.length > 0 && !(await mcpClient.isAvailable())) {
      onErrorRef.current?.("MCP Gateway 未启动，请先在设置中开启后再调用接口工具");
      return;
    }
    try {
      await runToolLoop({
        startStream: start,
        provider: {
          providerId: llm.providerId,
          model: llm.model,
          baseUrl: llm.baseUrl,
          apiKey: llm.apiKey,
          thinking: llm.thinking,
        },
        generation: {
          temperature: session.temperature,
          maxTokens: session.maxTokens,
          topP: session.topP,
          frequencyPenalty: session.frequencyPenalty,
          presencePenalty: session.presencePenalty,
        },
        initialMessages: toStreamMessages(session),
        toolsBuilder: () =>
          session.selectedEndpointIds.length > 0
            ? buildMcpFunctionTools({ endpointIds: session.selectedEndpointIds })
            : Promise.resolve([]),
        dispatch: dispatchViaMcp,
        onAssistantDelta: (full, thinking) => {
          const cur = currentSessionRef.current;
          if (!cur) return;
          const messages = [...cur.messages];
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
          const next = { ...cur, messages };
          currentSessionRef.current = next;
          onSessionRef.current?.(next);
        },
        onAssistantFinal: async ({ content, thinking, toolCalls }) => {
          const cur = currentSessionRef.current;
          if (!cur) return;
          const assistantMsg = makeMessage("assistant", content, {
            thinkingContent: thinking || undefined,
            toolCalls:
              toolCalls.length > 0
                ? toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments }))
                : undefined,
          });
          const lastIdx = cur.messages.length - 1;
          const last = cur.messages[lastIdx];
          let nextMessages: ChatMessage[];
          if (last?.role === "assistant" && !last.toolCalls) {
            nextMessages = [...cur.messages];
            nextMessages[lastIdx] = { ...last, ...assistantMsg, id: last.id, createdAt: last.createdAt };
          } else {
            nextMessages = [...cur.messages, assistantMsg];
          }
          const updated: ApiChatSession = { ...cur, messages: nextMessages };
          try {
            await persist(updated);
          } catch {
            /* ignore */
          }
        },
        onToolExecuted: async ({ call, result }) => {
          const cur = currentSessionRef.current;
          if (!cur) return;
          const extra: Partial<ChatMessage> = {
            toolCallId: call.id,
            toolName: call.name,
          };
          const meta = extractApiToolMetadata(result.structuredContent);
          if (meta) {
            if (meta.status !== undefined) extra.toolStatus = meta.status;
            if (meta.method !== undefined) extra.toolMethod = meta.method;
            if (meta.url !== undefined) extra.toolUrl = meta.url;
            if (meta.elapsedMs !== undefined) extra.toolElapsedMs = meta.elapsedMs;
            if (meta.totalBytes !== undefined) extra.toolBodyBytes = meta.totalBytes;
            if (meta.truncated !== undefined) extra.toolTruncated = meta.truncated;
          }
          const content = meta?.body
            ? `HTTP ${meta.status ?? "-"}\n\n${meta.body}`
            : result.content;
          const toolMessage = makeMessage("tool", content, extra);
          const updated: ApiChatSession = { ...cur, messages: [...cur.messages, toolMessage] };
          try {
            await persist(updated);
          } catch {
            /* ignore */
          }
        },
        onError: (msg) => onErrorRef.current?.(msg),
      });
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : String(err));
    }
  }

  async function send(args: RunArgs, userText: string): Promise<void> {
    const { session, llm, onSession, onError } = args;
    currentSessionRef.current = session;
    onSessionRef.current = onSession;
    onErrorRef.current = onError;

    const userMessage = makeMessage("user", userText);
    const next: ApiChatSession = {
      ...session,
      providerId: llm.providerId,
      messages: [...session.messages, userMessage],
    };
    setLoading(true);
    try {
      const saved = await persist(next);
      await runLoop(saved, llm);
    } finally {
      setLoading(false);
    }
  }

  async function regenerate(args: RunArgs, targetMessageId: string): Promise<void> {
    const idx = args.session.messages.findIndex((m) => m.id === targetMessageId);
    if (idx < 0) return;
    const prevUser = [...args.session.messages.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!prevUser) return;
    await send(args, prevUser.content);
  }

  async function retryUser(args: RunArgs, targetMessageId: string): Promise<void> {
    const idx = args.session.messages.findIndex((m) => m.id === targetMessageId);
    if (idx < 0) return;
    const target = args.session.messages[idx];
    if (target.role !== "user") return;
    await send(args, target.content);
  }

  async function stopAll() {
    await stop();
  }

  return { streaming, thinkingBuffer, loading, send, regenerate, retryUser, stop: stopAll };
}
