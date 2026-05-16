import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ChatSessionSummary } from "@/types";

interface SessionsSidebarProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  listLoading: boolean;
  sessionLoading: boolean;
  isConfigured: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRename: (session: ChatSessionSummary) => void;
  onDelete: (session: ChatSessionSummary) => void;
}

export function SessionsSidebar({
  sessions,
  activeSessionId,
  listLoading,
  sessionLoading,
  isConfigured,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: SessionsSidebarProps) {
  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 p-4 space-y-3 bg-gray-50 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">会话列表</div>
        <button
          className="px-2 py-1 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1"
          onClick={onCreate}
          disabled={!isConfigured}
        >
          <Plus size={14} /> 新建
        </button>
      </div>

      {listLoading && <div className="text-xs text-gray-400">加载中...</div>}

      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            className={`w-full text-left p-3 rounded-lg border ${activeSessionId === session.id ? "border-blue-400 bg-blue-50" : "border-gray-200"} ${sessionLoading ? "opacity-60" : ""}`}
            onClick={() => onSelect(session.id)}
            disabled={sessionLoading}
          >
            <div className="text-sm font-medium text-gray-800">{session.title}</div>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
              <span>{session.messageCount} 条</span>
              <div className="flex items-center gap-2">
                <span
                  className="hover:text-blue-500"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRename(session);
                  }}
                >
                  <Pencil size={12} />
                </span>
                <span
                  className="hover:text-red-500"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(session);
                  }}
                >
                  <Trash2 size={12} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
