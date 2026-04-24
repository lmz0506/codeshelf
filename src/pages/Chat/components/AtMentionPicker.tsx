import { useEffect, useMemo, useState } from "react";
import { X, FileText, Folder, Search } from "lucide-react";
import { listDirEntries, type MentionFileEntry } from "@/services/chat";

const MENTION_SCAN_LIMIT = 5000;

interface AtMentionPickerProps {
  open: boolean;
  root: string | null;
  onClose: () => void;
  /** 返回选中的相对路径列表，父组件负责插入到输入框 */
  onPick: (paths: string[]) => void;
}

export function AtMentionPicker({ open, root, onClose, onPick }: AtMentionPickerProps) {
  const [entries, setEntries] = useState<MentionFileEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !root) return;
    setLoading(true);
    setSelected(new Set());
    setQuery("");
    listDirEntries(root, MENTION_SCAN_LIMIT)
      .then((list) => setEntries(list.filter((e) => !e.isDir)))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, root]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 1000);
    return entries.filter((e) => e.path.toLowerCase().includes(q)).slice(0, 1000);
  }, [entries, query]);

  if (!open) return null;

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[600px] max-w-[92vw] h-[65vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText size={14} /> 引用文件
          </div>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {!root && (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            请先在顶部为会话选择 allowedCwd
          </div>
        )}
        {root && (
          <>
            <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
              <Folder size={12} className="text-gray-400" />
              <span className="text-[11px] text-gray-500 truncate flex-1">{root}</span>
            </div>
            <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
              <Search size={12} className="text-gray-400" />
              <input
                className="flex-1 text-xs outline-none"
                placeholder="按路径过滤..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-auto">
              {loading && <div className="p-3 text-xs text-gray-400">加载中...</div>}
              {!loading && filtered.map((e) => (
                <label key={e.path} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(e.path)} onChange={() => toggle(e.path)} />
                  <FileText size={11} className="text-gray-400" />
                  <span className="font-mono text-gray-700 truncate">{e.path}</span>
                </label>
              ))}
              {!loading && filtered.length === 0 && <div className="p-3 text-xs text-gray-400">无匹配</div>}
            </div>
            <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between">
              <div className="text-[11px] text-gray-500">已选 {selected.size} 个</div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onClose}>
                  取消
                </button>
                <button
                  className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg disabled:opacity-60"
                  disabled={selected.size === 0}
                  onClick={() => {
                    onPick(Array.from(selected));
                    onClose();
                  }}
                >
                  插入
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
