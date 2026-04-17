import { Pencil, Trash2, Pin, PinOff, Download } from "lucide-react";
import type { ChatSessionSummary } from "@/types";

interface SessionItemProps {
  session: ChatSessionSummary;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onExport: () => void;
}

export function SessionItem({ session, active, disabled, onSelect, onRename, onDelete, onTogglePin, onExport }: SessionItemProps) {
  return (
    <button
      className={`w-full text-left p-3 rounded-lg border ${active ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"} ${disabled ? "opacity-60" : ""}`}
      onClick={onSelect}
      disabled={disabled}
    >
      <div className="flex items-center gap-1">
        {session.pinned && <Pin size={12} className="text-amber-500 flex-shrink-0" />}
        <div className="text-sm font-medium text-gray-800 truncate">{session.title}</div>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
        <span>{session.messageCount} 条</span>
        <div className="flex items-center gap-2">
          <span
            className="hover:text-amber-500"
            title={session.pinned ? "取消置顶" : "置顶"}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
          >
            {session.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </span>
          <span
            className="hover:text-blue-500"
            title="导出为 Markdown"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
          >
            <Download size={12} />
          </span>
          <span
            className="hover:text-blue-500"
            title="重命名"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            <Pencil size={12} />
          </span>
          <span
            className="hover:text-red-500"
            title="删除"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={12} />
          </span>
        </div>
      </div>
    </button>
  );
}
