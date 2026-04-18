import { useMemo, useState } from "react";
import { ChevronsLeft, ChevronsRight, Edit2, Pin, Plus, Search, Trash2 } from "lucide-react";
import type { ApiChatSessionSummary } from "@/types";

interface ApiSessionSidebarProps {
  sessions: ApiChatSessionSummary[];
  activeSessionId: string | null;
  loading: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRename: (s: ApiChatSessionSummary) => void;
  onDelete: (s: ApiChatSessionSummary) => void;
  onTogglePin: (s: ApiChatSessionSummary) => void;
  onEditEndpoints: (s: ApiChatSessionSummary) => void;
}

export function ApiSessionSidebar({
  sessions,
  activeSessionId,
  loading,
  collapsed,
  onToggleCollapsed,
  onCreate,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onEditEndpoints,
}: ApiSessionSidebarProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions;
    const q = query.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query]);

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
          className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          onClick={onCreate}
          title="新建接口对话"
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
          <div className="text-sm font-semibold">接口对话</div>
        </div>
        <button
          className="px-2 py-1 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1"
          onClick={onCreate}
          title="新建接口对话"
        >
          <Plus size={12} /> 新建
        </button>
      </div>

      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          placeholder="搜索标题..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && <div className="text-xs text-gray-400">加载中...</div>}
      {!loading && sessions.length === 0 && (
        <div className="text-xs text-gray-400">暂无会话</div>
      )}
      {!loading && sessions.length > 0 && filtered.length === 0 && (
        <div className="text-xs text-gray-400">无匹配结果</div>
      )}

      <div className="flex-1 overflow-auto -mr-2 pr-2 space-y-2">
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`group border rounded-lg p-2 cursor-pointer text-xs ${
              activeSessionId === s.id
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
            onClick={() => onSelect(s.id)}
          >
            <div className="flex items-center gap-1 mb-1">
              {s.pinned && <Pin size={10} className="text-blue-500 fill-blue-500" />}
              <span className="flex-1 truncate" title={s.title}>{s.title}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-[10px]">
                {s.messageCount} 条 · {s.endpointCount} 接口
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  className="text-gray-400 hover:text-blue-500"
                  onClick={(e) => { e.stopPropagation(); onEditEndpoints(s); }}
                  title="修改绑定接口"
                >
                  <Edit2 size={10} />
                </button>
                <button
                  className="text-gray-400 hover:text-blue-500"
                  onClick={(e) => { e.stopPropagation(); onTogglePin(s); }}
                  title={s.pinned ? "取消置顶" : "置顶"}
                >
                  <Pin size={10} />
                </button>
                <button
                  className="text-gray-400 hover:text-blue-500"
                  onClick={(e) => { e.stopPropagation(); onRename(s); }}
                  title="重命名"
                >
                  ✎
                </button>
                <button
                  className="text-gray-400 hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); onDelete(s); }}
                  title="删除"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
