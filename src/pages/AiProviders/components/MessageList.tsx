import { useEffect, useRef } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/project/MarkdownRenderer";
import type { ChatSession } from "@/types";

interface MessageListProps {
  session: ChatSession;
  streaming: boolean;
  thinkingVisible: boolean;
  thinkingBuffer: string;
  expandedThinkingIds: Set<string>;
  onToggleThinking: (id: string) => void;
  onDeleteMessage: (id: string) => void;
}

export function MessageList({
  session,
  streaming,
  thinkingVisible,
  thinkingBuffer,
  expandedThinkingIds,
  onToggleThinking,
  onDeleteMessage,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages, thinkingBuffer]);

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4 min-h-0">
      {session.messages.map((msg) => {
        const isUser = msg.role === "user";
        const hasThinking = !isUser && Boolean(msg.thinkingContent);
        const isExpanded = hasThinking && expandedThinkingIds.has(msg.id);
        const fileAttachments = msg.attachments ?? [];
        const hasFiles = isUser && (fileAttachments.length > 0 || msg.content.startsWith("[File: "));
        let displayContent = msg.content;
        if (isUser && hasFiles && !msg.attachments) {
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
                onClick={() => onDeleteMessage(msg.id)}
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
                    onClick={() => onToggleThinking(msg.id)}
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
                onClick={() => onDeleteMessage(msg.id)}
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
  );
}
