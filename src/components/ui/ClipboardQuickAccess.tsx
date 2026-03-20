import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Pin, PinOff, ExternalLink, ClipboardList, Copy } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import { eventToKeys } from "@/hooks/useAppShortcuts";
import { getClipboardHistory, writeToClipboard, togglePinClipboardEntry } from "@/services/toolbox";
import { showToast } from "@/components/ui/Toast";
import type { ClipboardEntry } from "@/types/toolbox";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString();
}

export function ClipboardQuickAccess() {
  const show = useAppStore((s) => s.showClipboardQuickAccess);
  const toggle = useAppStore((s) => s.toggleClipboardQuickAccess);
  const navigateToTool = useAppStore((s) => s.navigateToTool);

  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 加载数据
  const loadData = () => {
    getClipboardHistory()
      .then(setEntries)
      .catch(console.error);
  };

  useEffect(() => {
    if (!show) {
      setSearch("");
      return;
    }
    setLoading(true);
    getClipboardHistory()
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [show]);

  // 监听剪贴板变化事件
  useEffect(() => {
    if (!show) return;
    const unlisten = listen("clipboard-changed", () => {
      loadData();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [show]);

  // 键盘事件
  useEffect(() => {
    if (!show) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
        return;
      }
      const pressed = eventToKeys(e);
      if (pressed) {
        const { appShortcuts } = useAppStore.getState();
        const binding = appShortcuts.find(
          (s) => s.id === "tool_clipboard" && s.enabled
        );
        if (binding && pressed === binding.keys) {
          e.preventDefault();
          e.stopImmediatePropagation();
          toggle();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [show, toggle]);

  // 过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        e.contentPreview.toLowerCase().includes(q)
    );
  }, [entries, search]);

  if (!show) return null;

  async function handleCopy(entry: ClipboardEntry) {
    try {
      await writeToClipboard(entry.content);
      showToast("success", "已复制到剪贴板");
      toggle();
    } catch (err) {
      showToast("error", "复制失败", String(err));
    }
  }

  async function handleTogglePin(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await togglePinClipboardEntry(id);
      loadData();
    } catch (err) {
      showToast("error", "操作失败", String(err));
    }
  }

  function goToFullPage() {
    toggle();
    navigateToTool("clipboard");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) toggle();
      }}
    >
      <div
        ref={panelRef}
        className="w-[520px] max-h-[65vh] flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        {/* 搜索栏 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索剪贴板历史..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            ESC 关闭
          </span>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ClipboardList size={32} className="mb-2 opacity-50" />
              <p className="text-sm">
                {search ? "没有匹配的记录" : "暂无剪贴板历史"}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => handleCopy(entry)}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group"
                >
                  <Copy size={14} className="text-gray-300 dark:text-gray-600 flex-shrink-0 group-hover:text-blue-500 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {entry.contentPreview}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                      <span className="text-[10px] text-gray-300 dark:text-gray-600">
                        {entry.charCount} 字符
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleTogglePin(e, entry.id)}
                    className={`flex-shrink-0 p-1 rounded transition-colors ${
                      entry.pinned
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-gray-300 dark:text-gray-600 hover:text-gray-500 opacity-0 group-hover:opacity-100"
                    }`}
                    title={entry.pinned ? "取消置顶" : "置顶"}
                  >
                    {entry.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            共 {filtered.length} 条
          </span>
          <button
            onClick={goToFullPage}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            <ExternalLink size={12} />
            打开完整页面
          </button>
        </div>
      </div>
    </div>
  );
}
