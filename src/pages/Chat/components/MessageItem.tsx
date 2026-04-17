import { useState } from "react";
import { MarkdownRenderer } from "@/components/project/MarkdownRenderer";
import type { ChatMessage } from "@/types";
import { MessageActions } from "./MessageActions";
import { formatAbsoluteTime, formatRelativeTime } from "../utils/time";

interface MessageItemProps {
  message: ChatMessage;
  isLastAssistant: boolean;
  streaming: boolean;
  streamingThisMessage: boolean;
  onCopy: () => void;
  onEditUser?: (newContent: string) => void;
  onRegenerate?: () => void;
  onDelete: () => void;
}

export function MessageItem({
  message,
  isLastAssistant,
  streaming,
  streamingThisMessage,
  onCopy,
  onEditUser,
  onRegenerate,
  onDelete,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

  function startEdit() {
    setEditValue(message.content);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== message.content && onEditUser) {
      onEditUser(trimmed);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setEditValue(message.content);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  return (
    <div className={`group flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {isUser && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-2">
          <MessageActions
            role="user"
            canRegenerate={false}
            streaming={streaming}
            onCopy={onCopy}
            onEdit={onEditUser ? startEdit : undefined}
            onDelete={onDelete}
          />
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser ? "bg-blue-500 text-white" : "bg-white border border-gray-200 text-gray-800"
        }`}
      >
        <div
          className={`text-[11px] mb-1 flex items-center gap-2 ${isUser ? "text-blue-100" : "text-gray-400"}`}
          title={formatAbsoluteTime(message.createdAt)}
        >
          <span>{isUser ? "你" : "助手"}</span>
          <span>·</span>
          <span>{formatRelativeTime(message.createdAt)}</span>
          {message.edited && <span className="italic">(已编辑)</span>}
          {streamingThisMessage && <span className="italic animate-pulse">正在生成…</span>}
        </div>

        {!isUser && message.thinkingContent && (
          <details className="mb-2 p-2 text-xs text-purple-600 bg-purple-50 rounded-lg" open={streamingThisMessage}>
            <summary className="font-semibold cursor-pointer select-none">thinking</summary>
            <div className="whitespace-pre-wrap mt-1">{message.thinkingContent}</div>
          </details>
        )}

        {editing && isUser ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              className="w-full bg-white/20 rounded-lg p-2 text-sm text-white placeholder-blue-100 outline-none"
              rows={Math.min(10, Math.max(3, editValue.split("\n").length))}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
            />
            <div className="flex justify-end gap-2 text-[11px]">
              <button className="px-2 py-0.5 rounded bg-white/20 text-white" onClick={cancelEdit}>
                取消 (Esc)
              </button>
              <button className="px-2 py-0.5 rounded bg-white text-blue-500" onClick={commitEdit}>
                保存并重发 (Enter)
              </button>
            </div>
          </div>
        ) : isUser ? (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
        ) : (
          <div className="text-sm leading-relaxed">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
      </div>
      {!isUser && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-2">
          <MessageActions
            role="assistant"
            canRegenerate={isLastAssistant}
            streaming={streaming}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}
