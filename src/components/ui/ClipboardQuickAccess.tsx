import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, Pin, PinOff, ExternalLink, ClipboardList, Copy } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@/stores/appStore";
import { eventToKeys } from "@/hooks/useAppShortcuts";
import { getClipboardHistory, writeToClipboard, togglePinClipboardEntry } from "@/services/toolbox";
import { showToast } from "@/components/ui/Toast";
import type { ClipboardEntry } from "@/types/toolbox";

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

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

  // 关闭弹窗：如果是全局快捷键从隐藏状态唤起的，自动藏回窗口
  const closePopup = useCallback(() => {
    toggle();
    const { popupAutoHideWindow, setPopupAutoHideWindow } = useAppStore.getState();
    if (popupAutoHideWindow) {
      setPopupAutoHideWindow(false);
      getCurrentWindow().hide().catch(console.error);
    }
  }, [toggle]);

  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 加载数据
  const loadData = useCallback(() => {
    getClipboardHistory()
      .then(setEntries)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!show) {
      setSearch("");
      setActiveIndex(-1);
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
  }, [show, loadData]);

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

  // 搜索变化时重置选中
  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  // 滚动选中项到可视区域
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // 复制
  const handleCopy = useCallback(async (entry: ClipboardEntry) => {
    try {
      await writeToClipboard(entry.content);
      showToast("success", "已复制到剪贴板");
      closePopup();
    } catch (err) {
      showToast("error", "复制失败", String(err));
    }
  }, [closePopup]);

  // 置顶
  const handleTogglePin = useCallback(async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await togglePinClipboardEntry(id);
      loadData();
    } catch (err) {
      showToast("error", "操作失败", String(err));
    }
  }, [loadData]);

  // 键盘事件：ESC / 快捷键关闭 / 上下箭头 / Enter / Ctrl+P
  useEffect(() => {
    if (!show) return;
    function handleKeyDown(e: KeyboardEvent) {
      // ESC 关闭
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closePopup();
        return;
      }

      // 再次按下触发快捷键 → 关闭
      const pressed = eventToKeys(e);
      if (pressed) {
        const { appShortcuts } = useAppStore.getState();
        const binding = appShortcuts.find(
          (s) => s.id === "tool_clipboard" && s.enabled
        );
        if (binding && pressed === binding.keys) {
          e.preventDefault();
          e.stopImmediatePropagation();
          closePopup();
          return;
        }
      }

      const len = filtered.length;
      if (len === 0) return;

      // ↓ 下移
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev < len - 1 ? prev + 1 : 0));
        return;
      }

      // ↑ 上移
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : len - 1));
        return;
      }

      // Enter → 复制选中条目
      if (e.key === "Enter") {
        e.preventDefault();
        const idx = activeIndex >= 0 && activeIndex < len ? activeIndex : 0;
        const entry = filtered[idx];
        if (entry) {
          handleCopy(entry);
        }
        return;
      }

      // Ctrl/Cmd + P → 置顶/取消置顶选中条目
      const isMod = IS_MAC ? e.metaKey : e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (activeIndex >= 0 && activeIndex < len) {
          handleTogglePin(filtered[activeIndex].id);
        }
        return;
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [show, closePopup, filtered, activeIndex, handleCopy, handleTogglePin]);

  if (!show) return null;

  function goToFullPage() {
    // 跳转完整页面时清除自动隐藏标记（用户需要看到主界面）
    useAppStore.getState().setPopupAutoHideWindow(false);
    toggle();
    navigateToTool("clipboard");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePopup();
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
        <div ref={listRef} className="flex-1 overflow-y-auto">
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
              {filtered.map((entry, index) => {
                const isActive = index === activeIndex;
                return (
                  <div
                    key={entry.id}
                    ref={(el) => { itemRefs.current[index] = el; }}
                    onClick={() => handleCopy(entry)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex items-center gap-3 px-4 py-2 transition-colors cursor-pointer group ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    <Copy size={14} className={`flex-shrink-0 transition-colors ${
                      isActive ? "text-blue-500" : "text-gray-300 dark:text-gray-600 group-hover:text-blue-500"
                    }`} />
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
                      onClick={(e) => handleTogglePin(entry.id, e)}
                      className={`flex-shrink-0 p-1 rounded transition-colors ${
                        entry.pinned
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-gray-300 dark:text-gray-600 hover:text-gray-500 opacity-0 group-hover:opacity-100"
                      }`}
                      title={entry.pinned ? "取消置顶" : "置顶（不会被队列挤掉）"}
                    >
                      {entry.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            共 {filtered.length} 条
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400 flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400">↑↓</kbd>
              选择
              <kbd className="px-1 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400">Enter</kbd>
              复制
              <kbd className="px-1 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400">{IS_MAC ? "⌘P" : "Ctrl+P"}</kbd>
              置顶
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
    </div>
  );
}
