import { useState } from "react";
import { Copy, Pencil, RefreshCw, Trash2, Check } from "lucide-react";

interface MessageActionsProps {
  role: "user" | "assistant" | "system";
  canRegenerate: boolean;
  streaming: boolean;
  onCopy: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onDelete: () => void;
}

export function MessageActions({ role, canRegenerate, streaming, onCopy, onEdit, onRegenerate, onRetry, onDelete }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-1 text-gray-400">
      <button
        className="hover:text-blue-500 p-1"
        title={copied ? "已复制" : "复制"}
        onClick={handleCopy}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {role === "user" && onEdit && !streaming && (
        <button className="hover:text-blue-500 p-1" title="编辑并重发" onClick={onEdit}>
          <Pencil size={14} />
        </button>
      )}
      {role === "user" && onRetry && !streaming && (
        <button className="hover:text-blue-500 p-1" title="重新发送（保留原文）" onClick={onRetry}>
          <RefreshCw size={14} />
        </button>
      )}
      {role === "assistant" && canRegenerate && onRegenerate && !streaming && (
        <button className="hover:text-blue-500 p-1" title="重新生成" onClick={onRegenerate}>
          <RefreshCw size={14} />
        </button>
      )}
      {!streaming && (
        <button className="hover:text-red-500 p-1" title="删除此消息" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
