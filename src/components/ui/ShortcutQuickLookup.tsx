import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, Keyboard, ExternalLink } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@/stores/appStore";
import { getShortcuts, getCurrentPlatform } from "@/services/toolbox";
import type { ShortcutEntry } from "@/types/toolbox";

const CATEGORY_LABELS: Record<string, string> = {
  system: "系统快捷键",
  vscode: "VS Code",
  idea: "IDEA",
};

const PRESET_ORDER = ["system", "vscode", "idea"];

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

function renderKeys(keys: string) {
  const parts = keys
    .split("+")
    .map((k) => k.trim())
    .filter(Boolean);
  return (
    <span className="inline-flex items-center gap-0.5 flex-wrap">
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <span className="text-gray-400 text-[10px]">+</span>}
          <kbd className="px-1 py-0.5 text-[11px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm text-gray-700 dark:text-gray-300 min-w-[1.2rem] text-center leading-none">
            {part}
          </kbd>
        </span>
      ))}
    </span>
  );
}

export function ShortcutQuickLookup() {
  const show = useAppStore((s) => s.showShortcutQuickLookup);
  const toggle = useAppStore((s) => s.toggleShortcutQuickLookup);
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

  const [shortcuts, setShortcuts] = useState<ShortcutEntry[]>([]);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<string>("windows");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 加载数据
  useEffect(() => {
    if (!show) {
      setSearch("");
      return;
    }
    setLoading(true);
    Promise.all([getShortcuts(), getCurrentPlatform()])
      .then(([data, plat]) => {
        setShortcuts(data);
        setPlatform(plat);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [show]);

  // 键盘事件：Escape 关闭、快捷键再次按下关闭
  useEffect(() => {
    if (!show) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closePopup();
        return;
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [show, closePopup]);

  // 过滤
  const filtered = useMemo(() => {
    const items = shortcuts.filter((s) => s.platform === platform);
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (s) =>
        s.description.toLowerCase().includes(q) ||
        s.keys.toLowerCase().includes(q) ||
        getCategoryLabel(s.category).toLowerCase().includes(q)
    );
  }, [shortcuts, platform, search]);

  // 分组（保持预设顺序，自定义在后）
  const grouped = useMemo(() => {
    const groups: Record<string, ShortcutEntry[]> = {};

    for (const cat of PRESET_ORDER) {
      const items = filtered.filter((s) => s.category === cat);
      if (items.length > 0) groups[cat] = items;
    }

    const customCats = new Set<string>();
    for (const s of filtered) {
      if (!PRESET_ORDER.includes(s.category)) customCats.add(s.category);
    }
    for (const cat of Array.from(customCats).sort()) {
      groups[cat] = filtered.filter((s) => s.category === cat);
    }

    return groups;
  }, [filtered]);

  if (!show) return null;

  function goToFullPage() {
    // 跳转完整页面时清除自动隐藏标记（用户需要看到主界面）
    useAppStore.getState().setPopupAutoHideWindow(false);
    toggle();
    navigateToTool("shortcuts");
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
            placeholder="搜索快捷键..."
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
          ) : Object.keys(grouped).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Keyboard size={32} className="mb-2 opacity-50" />
              <p className="text-sm">没有匹配的快捷键</p>
            </div>
          ) : (
            <div className="py-1">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-4 py-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide sticky top-0 bg-white dark:bg-gray-900">
                    {getCategoryLabel(category)}
                    <span className="ml-1 text-gray-300 dark:text-gray-600">
                      ({items.length})
                    </span>
                  </div>
                  {items.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 truncate">
                        {entry.description}
                      </span>
                      <div className="flex-shrink-0">{renderKeys(entry.keys)}</div>
                    </div>
                  ))}
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
