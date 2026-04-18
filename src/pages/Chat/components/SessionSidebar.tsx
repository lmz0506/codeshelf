import { useMemo, useState } from "react";
import { ChevronsLeft, ChevronsRight, Plus, Search, Upload } from "lucide-react";
import type { ChatSessionSummary } from "@/types";
import { SessionItem } from "./SessionItem";
import { groupSessions } from "../utils/groupSessions";

interface SessionSidebarProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  isSwitching: boolean;
  isConfigured: boolean;
  loading: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCreate: () => void;
  onImport: () => void;
  onSelect: (id: string) => void;
  onRename: (session: ChatSessionSummary) => void;
  onDelete: (session: ChatSessionSummary) => void;
  onTogglePin: (session: ChatSessionSummary) => void;
  onExport: (session: ChatSessionSummary) => void;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  isSwitching,
  isConfigured,
  loading,
  collapsed,
  onToggleCollapsed,
  onCreate,
  onImport,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onExport,
}: SessionSidebarProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions;
    const q = query.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query]);

  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  if (collapsed) {
    return (
      <aside className="w-12 flex-shrink-0 border-r border-gray-200 py-3 flex flex-col items-center gap-2 bg-white">
        <button
          className="p-1.5 text-gray-500 rounded-lg hover:bg-gray-100"
          onClick={onToggleCollapsed}
          title="展开会话列表"
        >
          <ChevronsRight size={16} />
        </button>
        <button
          className="p-1.5 bg-blue-500 text-white rounded-lg disabled:opacity-60 hover:bg-blue-600"
          onClick={onCreate}
          title={isConfigured ? "新建会话" : "尚未配置模型，先去配置"}
        >
          <Plus size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-72 flex-shrink-0 border-r border-gray-200 p-4 space-y-3 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            className="p-1 text-gray-500 rounded hover:bg-gray-100"
            onClick={onToggleCollapsed}
            title="收起会话列表"
          >
            <ChevronsLeft size={14} />
          </button>
          <div className="text-sm font-semibold">会话列表</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="px-2 py-1 text-xs border border-gray-200 text-gray-600 rounded-lg flex items-center gap-1 hover:bg-gray-50"
            onClick={onImport}
            title="从 JSON 导入会话"
          >
            <Upload size={12} />
          </button>
          <button
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1 disabled:opacity-60"
            onClick={onCreate}
            title={isConfigured ? "新建会话" : "尚未配置模型，先去配置"}
          >
            <Plus size={12} /> 新建
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          placeholder="搜索会话标题..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && <div className="text-xs text-gray-400">加载中...</div>}
      {!loading && sessions.length === 0 && <div className="text-xs text-gray-400">暂无会话</div>}
      {!loading && sessions.length > 0 && filtered.length === 0 && (
        <div className="text-xs text-gray-400">无匹配结果</div>
      )}

      <div className="flex-1 overflow-auto space-y-4 -mr-2 pr-2">
        {groups.map((g) => (
          <div key={g.key} className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">{g.label}</div>
            <div className="space-y-2">
              {g.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={activeSessionId === session.id}
                  disabled={isSwitching}
                  onSelect={() => onSelect(session.id)}
                  onRename={() => onRename(session)}
                  onDelete={() => onDelete(session)}
                  onTogglePin={() => onTogglePin(session)}
                  onExport={() => onExport(session)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
