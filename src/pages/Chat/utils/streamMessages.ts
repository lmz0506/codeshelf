import type { EditorConfig } from "@/stores/editorsStore";
import type { ChatSession } from "@/types";
import type { ChatStreamMessage } from "@/services/chat";
import type { ModelOption } from "./chatHelpers";

interface CompactionContext {
  summary: string;
  sourceMessageCount: number;
  version: string;
}

interface BuildStreamMessagesParams {
  session: ChatSession;
  globalMemory: string;
  projectContext: string;
  mentionContext: string;
  editors: EditorConfig[];
  selected: ModelOption | null;
  compaction?: CompactionContext;
}

/**
 * 把 session 转成发给 LLM 的消息数组。
 * 若提供 compaction，则把 session.messages 的前 sourceMessageCount 条替换为一条 system 摘要。
 */
export function buildStreamMessages({
  session,
  globalMemory,
  projectContext,
  mentionContext,
  editors,
  selected,
  compaction,
}: BuildStreamMessagesParams): ChatStreamMessage[] {
  const out: ChatStreamMessage[] = [];
  const sysParts: string[] = [];
  if (globalMemory.trim()) sysParts.push(`[全局记忆 MEMORY.md]\n${globalMemory.trim()}`);
  if (projectContext.trim()) sysParts.push(projectContext.trim());
  if (editors.length > 0) {
    const lines = editors
      .map((e) => `- ${e.name}${e.is_default ? "（默认）" : ""}: ${e.path}`)
      .join("\n");
    sysParts.push(
      `[可用编辑器]\n调用 OpenInEditor 工具时 editor 参数优先从下列用户已配置的真实路径中选；若用户未指明哪个编辑器，用带"（默认）"那一个。\n${lines}`,
    );
  }
  if (session.systemPrompt?.trim()) sysParts.push(session.systemPrompt.trim());
  if (mentionContext.trim()) sysParts.push(mentionContext.trim());
  if (compaction) {
    sysParts.push(
      `[上下文压缩 ${compaction.version}] 以下是早期 ${compaction.sourceMessageCount} 条对话的摘要：\n\n${compaction.summary}`,
    );
  }
  if (sysParts.length) out.push({ role: "system", content: sysParts.join("\n\n---\n\n") });

  const skip = compaction ? Math.min(compaction.sourceMessageCount, session.messages.length) : 0;
  const messagesToSend = skip > 0 ? session.messages.slice(skip) : session.messages;
  for (const m of messagesToSend) {
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
    } else if (m.role === "user" && m.attachments?.some((a) => a.kind === "image") && selected?.model.vision) {
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      > = [];
      const textAtts = m.attachments.filter((a) => a.kind === "text") as Array<{ kind: "text"; name: string; content: string }>;
      const textPrefix = textAtts.length
        ? textAtts.map((a) => `### ${a.name}\n\`\`\`\n${a.content}\n\`\`\``).join("\n\n") + "\n\n"
        : "";
      const combined = textPrefix + (m.content.trim() ? m.content : "");
      if (combined.trim()) parts.push({ type: "text", text: combined });
      for (const a of m.attachments) {
        if (a.kind === "image") parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
      }
      out.push({ role: "user", content: parts });
    } else if (m.role === "user" && m.attachments && m.attachments.length > 0) {
      const textAtts = m.attachments.filter((a) => a.kind === "text") as Array<{ kind: "text"; name: string; content: string }>;
      const imgCount = m.attachments.filter((a) => a.kind === "image").length;
      const prefix = textAtts.map((a) => `### ${a.name}\n\`\`\`\n${a.content}\n\`\`\``).join("\n\n");
      const imgHint = imgCount > 0 && !selected?.model.vision ? `\n\n（当前模型未开启视觉，已跳过 ${imgCount} 张图片）` : "";
      out.push({ role: "user", content: `${prefix}${imgHint}\n\n${m.content}`.trim() });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}
