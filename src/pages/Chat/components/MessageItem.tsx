import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/project/MarkdownRenderer";
import type { ChatMessage } from "@/types";
import { MessageActions } from "./MessageActions";
import { ToolCallBubble, type EndpointMeta } from "./ToolCallBubble";
import { formatAbsoluteTime, formatRelativeTime } from "../utils/time";
import { messageTokens } from "../utils/tokens";

interface MessageItemProps {
  message: ChatMessage;
  isLastAssistant: boolean;
  streaming: boolean;
  streamingThisMessage: boolean;
  onCopy: () => void;
  onEditUser?: (newContent: string) => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onDelete: () => void;
  endpointLookup?: (toolName: string) => EndpointMeta | null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function statusTone(status?: number): {
  bg: string;
  border: string;
  text: string;
  badge: string;
} {
  if (!status) {
    return {
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-800",
      badge: "bg-slate-200 text-slate-700",
    };
  }
  if (status >= 200 && status < 300) {
    return {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-800",
      badge: "bg-emerald-200 text-emerald-800",
    };
  }
  if (status >= 400 && status < 500) {
    return {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-800",
      badge: "bg-amber-200 text-amber-800",
    };
  }
  if (status >= 500) {
    return {
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-800",
      badge: "bg-rose-200 text-rose-800",
    };
  }
  return {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-800",
    badge: "bg-slate-200 text-slate-700",
  };
}

function prettyBody(content: string): string {
  // 旧消息 content 形如 "HTTP 200\n\n<body>"；新消息 content 同样格式，但有独立字段。
  // 这里统一尝试剥掉 "HTTP xxx\n\n" 前缀再 pretty。
  let body = content;
  const match = /^HTTP\s+\d+\s*\n\n?/.exec(content);
  if (match) body = content.slice(match[0].length);
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function MessageItem({
  message,
  streaming,
  streamingThisMessage,
  onCopy,
  onEditUser,
  onRegenerate,
  onRetry,
  onDelete,
  endpointLookup,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [thinkingOpen, setThinkingOpen] = useState(streamingThisMessage);
  const [toolResultOpen, setToolResultOpen] = useState(false);

  useEffect(() => {
    setThinkingOpen(streamingThisMessage);
  }, [streamingThisMessage]);

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

  // compact 边界或 system 消息
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <div className="font-semibold text-amber-700 mb-1">system</div>
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  // 工具结果消息单独样式
  if (message.role === "tool") {
    // METHOD/URL：优先消息自带字段，缺省时回退 endpointLookup(toolName)
    const looked =
      !message.toolMethod && !message.toolUrl && message.toolName
        ? endpointLookup?.(message.toolName) ?? null
        : null;
    const method = message.toolMethod ?? looked?.method;
    const url = message.toolUrl ?? looked?.url;

    // "调用中…"占位（并行工具调用进行中）
    if (message.toolPending) {
      return (
        <div className="group flex items-start gap-2 justify-start">
          <div className="max-w-[75%] min-w-0 rounded-2xl px-3 py-2 border text-xs bg-slate-50 border-slate-200 text-slate-600">
            <div className="flex items-center gap-2 flex-wrap">
              <Loader2 size={12} className="animate-spin shrink-0 text-slate-400" />
              {method && <span className="font-semibold uppercase shrink-0">{method}</span>}
              {url && <span className="font-mono truncate min-w-0">{url}</span>}
              <span className="animate-pulse">调用中…</span>
            </div>
          </div>
        </div>
      );
    }

    const tone = statusTone(message.toolStatus);
    const hasMeta = Boolean(method || message.toolStatus);
    return (
      <div className="group flex items-start gap-2 justify-start">
        <div className={`max-w-[75%] min-w-0 rounded-2xl px-3 py-2 border text-xs ${tone.bg} ${tone.border} ${tone.text}`}>
          <details open={toolResultOpen} onToggle={(e) => setToolResultOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer select-none flex items-center gap-2 flex-wrap">
              <span className="font-semibold shrink-0">↳</span>
              {hasMeta ? (
                <>
                  {method && (
                    <span className="font-semibold uppercase shrink-0">{method}</span>
                  )}
                  {url && (
                    <span className="font-mono truncate min-w-0">{url}</span>
                  )}
                  {typeof message.toolStatus === "number" && (
                    <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] shrink-0 ${tone.badge}`}>
                      {message.toolStatus}
                    </span>
                  )}
                  {typeof message.toolElapsedMs === "number" && (
                    <span className="text-[10px] opacity-70 shrink-0">{message.toolElapsedMs} ms</span>
                  )}
                  {typeof message.toolBodyBytes === "number" && (
                    <span className="text-[10px] opacity-70 shrink-0">
                      {formatBytes(message.toolBodyBytes)}
                      {message.toolTruncated ? " · 已截断" : ""}
                    </span>
                  )}
                </>
              ) : (
                <span className="font-semibold">{message.toolName || "tool"} 结果</span>
              )}
              <span className="text-[10px] opacity-60 shrink-0" title={formatAbsoluteTime(message.createdAt)}>
                {formatRelativeTime(message.createdAt)}
              </span>
            </summary>
            <pre className="font-mono whitespace-pre-wrap break-all mt-2 max-h-96 overflow-auto text-[11px]">
              {prettyBody(message.content)}
            </pre>
          </details>
        </div>
        <div className="opacity-60 group-hover:opacity-100 transition-opacity mt-2">
          <MessageActions role="assistant" canRegenerate={false} streaming={streaming} onCopy={onCopy} onDelete={onDelete} />
        </div>
      </div>
    );
  }

  // 内联可重试错误气泡（接口对话：流式/接口执行失败）
  if (message.error) {
    return (
      <div className="group flex items-start gap-2 justify-start">
        <div className="max-w-[75%] min-w-0 rounded-2xl px-4 py-3 border bg-rose-50 border-rose-200 text-rose-800">
          <div className="text-[11px] mb-1 flex items-center gap-2 text-rose-500">
            <span className="font-semibold">⚠ 出错了</span>
            <span title={formatAbsoluteTime(message.createdAt)}>{formatRelativeTime(message.createdAt)}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
          {onRegenerate && (
            <button
              className="mt-2 px-2.5 py-1 text-xs rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-60"
              onClick={onRegenerate}
              disabled={streaming}
            >
              重试
            </button>
          )}
        </div>
        <div className="opacity-60 group-hover:opacity-100 transition-opacity mt-2">
          <MessageActions role="assistant" canRegenerate={false} streaming={streaming} onCopy={onCopy} onDelete={onDelete} />
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {isUser && (
        <div className="opacity-60 group-hover:opacity-100 transition-opacity mt-2">
          <MessageActions
            role="user"
            canRegenerate={false}
            streaming={streaming}
            onCopy={onCopy}
            onEdit={onEditUser ? startEdit : undefined}
            onRetry={onRetry}
            onDelete={onDelete}
          />
        </div>
      )}
      <div
        className={`max-w-[75%] min-w-0 overflow-hidden rounded-2xl px-4 py-3 shadow-sm ${
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
          <span>·</span>
          {typeof message.tokens === "number" ? (
            <span title="本轮 token 用量">{message.tokens} tok</span>
          ) : (
            <span title="估算 tokens">~{messageTokens(message)} tok</span>
          )}
          {message.edited && <span className="italic">(已编辑)</span>}
          {streamingThisMessage && <span className="italic animate-pulse">正在生成…</span>}
        </div>

        {!isUser && message.thinkingContent && (
          <details
            className="mb-2 p-2 text-xs text-purple-600 bg-purple-50 rounded-lg"
            open={thinkingOpen}
            onToggle={(e) => setThinkingOpen((e.target as HTMLDetailsElement).open)}
          >
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
          <>
            {message.attachments?.some((a) => a.kind === "image") && (
              <div className="flex gap-2 flex-wrap mb-2">
                {message.attachments
                  .filter((a): a is { kind: "image"; dataUrl: string; name?: string } => a.kind === "image")
                  .map((a, idx) => (
                    <img
                      key={idx}
                      src={a.dataUrl}
                      alt={a.name ?? ""}
                      className="max-w-[200px] max-h-[200px] rounded border border-white/30"
                    />
                  ))}
              </div>
            )}
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
          </>
        ) : (
          <>
            {message.content && (
              <div className="text-sm leading-relaxed">
                <MarkdownRenderer content={message.content} />
              </div>
            )}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className={message.content ? "mt-2" : ""}>
                <ToolCallBubble toolCalls={message.toolCalls} endpointLookup={endpointLookup} />
              </div>
            )}
          </>
        )}
      </div>
      {!isUser && (
        <div className="opacity-60 group-hover:opacity-100 transition-opacity mt-2">
          <MessageActions
            role="assistant"
            canRegenerate={true}
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
