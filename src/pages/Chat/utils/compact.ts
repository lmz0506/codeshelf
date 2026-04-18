import { chatStream, type ChatStreamMessage } from "@/services/chat";
import type { ChatMessage, ChatSession } from "@/types";
import { listen } from "@tauri-apps/api/event";

const SUMMARY_PROMPT = `请对以下对话进行结构化压缩，保留：
1. 用户的目标/约束
2. 关键的技术决策与原因
3. 已经完成的步骤与仍未完成的事项
4. 涉及到的文件路径、函数名、变量名

输出纯 markdown 摘要，不要加多余寒暄。摘要将作为后续对话的上下文。`;

/**
 * 将 session 中早期消息压缩为一条 system 摘要，保留最近 keep 条原样。
 * 返回新的 messages 数组；失败则抛错。
 */
export async function compactMessages(params: {
  session: ChatSession;
  providerId: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  keep?: number;
}): Promise<ChatMessage[]> {
  const keep = params.keep ?? 4;
  const original = params.session.messages;
  if (original.length <= keep) {
    throw new Error(`消息数 ≤ ${keep}，无需压缩`);
  }
  const toCompact = original.slice(0, original.length - keep);
  const tail = original.slice(original.length - keep);

  const transcript = toCompact
    .map((m) => {
      const who = m.role === "user" ? "用户" : m.role === "assistant" ? "助手" : m.role === "tool" ? `工具(${m.toolName})` : "系统";
      return `## ${who}\n${m.content}`;
    })
    .join("\n\n");

  const messages: ChatStreamMessage[] = [
    { role: "system", content: SUMMARY_PROMPT },
    { role: "user", content: transcript },
  ];

  const requestId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let summary = "";
  let error: string | null = null;

  const unlisten = await listen<{ requestId: string; delta?: string; done: boolean; error?: string }>(
    "chat-stream",
    (event) => {
      if (event.payload.requestId !== requestId) return;
      if (event.payload.error) error = event.payload.error;
      if (event.payload.delta) summary += event.payload.delta;
    }
  );

  const donePromise = new Promise<void>((resolve) => {
    const unlistenDone = listen<{ requestId: string; done: boolean; error?: string }>("chat-stream", (event) => {
      if (event.payload.requestId !== requestId) return;
      if (event.payload.done || event.payload.error) {
        resolve();
        unlistenDone.then((fn) => fn()).catch(() => {});
      }
    });
  });

  await chatStream({
    requestId,
    providerId: params.providerId,
    model: params.model,
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    stream: true,
    messages,
  });

  await donePromise;
  unlisten();
  if (error) throw new Error(error);
  if (!summary.trim()) throw new Error("摘要为空");

  const marker: ChatMessage = {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "system",
    content: `[compact] 以下是早期对话的摘要（由 ${toCompact.length} 条消息压缩而成）:\n\n${summary.trim()}`,
    createdAt: new Date().toISOString(),
  };
  return [marker, ...tail];
}
