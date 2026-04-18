import { useRef, useState } from "react";
import { useChatStream } from "@/pages/Chat/hooks/useChatStream";
import type { ChatStreamMessage } from "@/services/chat";
import { buildApiTools, executeApiEndpoint, saveApiChatSession } from "@/services/api_chat";
import type { ApiChatSession, ChatMessage, ToolCall } from "@/types";

const MAX_TOOL_ROUNDS = 10;

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

  async function runRequest(session: ApiChatSession, llm: LlmContext, round = 0): Promise<void> {
    if (round >= MAX_TOOL_ROUNDS) {
      onErrorRef.current?.(`已达最大工具循环轮次 ${MAX_TOOL_ROUNDS}`);
      return;
    }
    let tools: unknown[] = [];
    let toolNameMap: Record<string, string> = {};
    if (session.selectedEndpointIds.length > 0) {
      const bundle = await buildApiTools(session.selectedEndpointIds);
      tools = bundle.tools;
      toolNameMap = bundle.toolNameMap;
    }

    try {
      await start(
        {
          providerId: llm.providerId,
          model: llm.model,
          baseUrl: llm.baseUrl,
          apiKey: llm.apiKey,
          thinking: llm.thinking,
          stream: llm.stream !== false,
          temperature: session.temperature,
          maxTokens: session.maxTokens,
          topP: session.topP,
          frequencyPenalty: session.frequencyPenalty,
          presencePenalty: session.presencePenalty,
          messages: toStreamMessages(session),
          tools: tools.length > 0 ? (tools as never) : undefined,
        },
        {
          onDelta: (full, thinking) => {
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
          onThinking: () => {},
          onToolCallDelta: () => {},
          onDone: async (finalContent, finalThinking, toolCalls, finishReason) => {
            const cur = currentSessionRef.current;
            if (!cur) return;

            const assistantMsg = makeMessage("assistant", finalContent, {
              thinkingContent: finalThinking || undefined,
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
            let updated: ApiChatSession = { ...cur, messages: nextMessages };
            try {
              updated = await persist(updated);
            } catch {
              /* ignore */
            }

            if (finishReason === "tool_calls" && toolCalls.length > 0) {
              await executeAndContinue(
                updated,
                toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
                toolNameMap,
                llm,
                round,
              );
            }
          },
          onError: (msg) => onErrorRef.current?.(msg),
        },
      );
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : String(err));
    }
  }

  async function executeAndContinue(
    sessionAfterAssistant: ApiChatSession,
    calls: ToolCall[],
    toolNameMap: Record<string, string>,
    llm: LlmContext,
    round: number,
  ) {
    let session = sessionAfterAssistant;
    for (const call of calls) {
      const endpointId = toolNameMap[call.name];
      let toolExtra: Partial<ChatMessage> = {
        toolCallId: call.id,
        toolName: call.name,
      };
      let resultContent: string;
      if (!endpointId) {
        resultContent = `（未找到工具 ${call.name} 对应的接口）`;
      } else {
        try {
          const result = await executeApiEndpoint(endpointId, call.arguments || "{}");
          resultContent = `HTTP ${result.status}\n\n${result.body}`;
          toolExtra = {
            ...toolExtra,
            toolStatus: result.status,
            toolMethod: result.method,
            toolUrl: result.url,
            toolElapsedMs: result.elapsedMs,
            toolBodyBytes: result.totalBytes,
            toolTruncated: result.truncated,
          };
        } catch (err) {
          resultContent = `执行失败: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      const toolMessage = makeMessage("tool", resultContent, toolExtra);
      session = { ...session, messages: [...session.messages, toolMessage] };
      try {
        session = await persist(session);
      } catch {
        /* ignore */
      }
    }
    await runRequest(session, llm, round + 1);
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
      await runRequest(saved, llm);
    } finally {
      setLoading(false);
    }
  }

  async function regenerate(args: RunArgs, targetMessageId: string): Promise<void> {
    const { session, llm, onSession, onError } = args;
    currentSessionRef.current = session;
    onSessionRef.current = onSession;
    onErrorRef.current = onError;
    const idx = session.messages.findIndex((m) => m.id === targetMessageId);
    if (idx < 0) return;
    const truncated = session.messages.slice(0, idx);
    const next: ApiChatSession = { ...session, messages: truncated };
    setLoading(true);
    try {
      const saved = await persist(next);
      await runRequest(saved, llm);
    } finally {
      setLoading(false);
    }
  }

  async function retryUser(args: RunArgs, targetMessageId: string): Promise<void> {
    const { session, llm, onSession, onError } = args;
    currentSessionRef.current = session;
    onSessionRef.current = onSession;
    onErrorRef.current = onError;
    const idx = session.messages.findIndex((m) => m.id === targetMessageId);
    if (idx < 0) return;
    if (session.messages[idx].role !== "user") return;
    // 保留到并包含该用户消息，裁掉其后的助手/工具回复
    const truncated = session.messages.slice(0, idx + 1);
    const next: ApiChatSession = { ...session, messages: truncated };
    setLoading(true);
    try {
      const saved = await persist(next);
      await runRequest(saved, llm);
    } finally {
      setLoading(false);
    }
  }

  async function stopAll() {
    await stop();
  }

  return { streaming, thinkingBuffer, loading, send, regenerate, retryUser, stop: stopAll };
}
