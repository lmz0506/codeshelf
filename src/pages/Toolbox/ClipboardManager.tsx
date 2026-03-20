import { useState, useEffect, useMemo } from "react";
import {
  ClipboardList,
  Search,
  Trash2,
  Pin,
  PinOff,
  Copy,
  Settings,
  ChevronDown,
  ChevronRight,
  Filter,
  StickyNote,
  Check,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { ToolPanelHeader } from "./index";
import { showToast } from "@/components/ui/Toast";
import {
  getClipboardHistory,
  deleteClipboardEntry,
  togglePinClipboardEntry,
  clearClipboardHistory,
  getClipboardSettings,
  saveClipboardSettings,
  writeToClipboard,
  updateClipboardNote,
} from "@/services/toolbox";
import type { ClipboardEntry, ClipboardSettings } from "@/types/toolbox";

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHr < 24) return `${diffHr}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleString();
}

export function ClipboardManager({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [settings, setSettings] = useState<ClipboardSettings>({
    enabled: true,
    maxItems: 50,
    monitorIntervalMs: 800,
  });
  const [search, setSearch] = useState("");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const loadData = async () => {
    try {
      const [historyData, settingsData] = await Promise.all([
        getClipboardHistory(),
        getClipboardSettings(),
      ]);
      setEntries(historyData);
      setSettings(settingsData);
    } catch (err) {
      console.error("加载剪贴板数据失败:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 监听剪贴板变化事件
  useEffect(() => {
    const unlisten = listen("clipboard-changed", () => {
      getClipboardHistory().then(setEntries).catch(console.error);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // 过滤
  const filtered = useMemo(() => {
    let items = entries;
    if (showPinnedOnly) {
      items = items.filter((e) => e.pinned);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          e.content.toLowerCase().includes(q) ||
          e.contentPreview.toLowerCase().includes(q) ||
          (e.note && e.note.toLowerCase().includes(q))
      );
    }
    return items;
  }, [entries, search, showPinnedOnly]);

  async function handleCopy(entry: ClipboardEntry) {
    try {
      await writeToClipboard(entry.content);
      showToast("success", "已复制到剪贴板");
    } catch (err) {
      showToast("error", "复制失败", String(err));
    }
  }

  async function handleTogglePin(id: string) {
    try {
      await togglePinClipboardEntry(id);
      const updated = await getClipboardHistory();
      setEntries(updated);
    } catch (err) {
      showToast("error", "操作失败", String(err));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteClipboardEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      showToast("error", "删除失败", String(err));
    }
  }

  function startEditNote(entry: ClipboardEntry) {
    setEditingNoteId(entry.id);
    setNoteInput(entry.note || "");
  }

  async function saveNote(id: string) {
    try {
      const updated = await updateClipboardNote(id, noteInput);
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingNoteId(null);
    } catch (err) {
      showToast("error", "保存备注失败", String(err));
    }
  }

  function cancelEditNote() {
    setEditingNoteId(null);
    setNoteInput("");
  }

  async function handleClearHistory() {
    try {
      await clearClipboardHistory();
      const updated = await getClipboardHistory();
      setEntries(updated);
      showToast("success", "已清空非置顶记录");
    } catch (err) {
      showToast("error", "清空失败", String(err));
    }
  }

  async function handleSaveSettings(newSettings: ClipboardSettings) {
    try {
      await saveClipboardSettings(newSettings);
      setSettings(newSettings);
      // 重新加载（可能有裁剪）
      const updated = await getClipboardHistory();
      setEntries(updated);
      showToast("success", "设置已保存");
    } catch (err) {
      showToast("error", "保存设置失败", String(err));
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ToolPanelHeader
        title="剪贴板历史"
        icon={ClipboardList}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-md transition-colors ${
                showSettings
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              }`}
              title="设置"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={handleClearHistory}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-red-500 transition-colors"
              title="清空非置顶记录（置顶条目会保留）"
            >
              <Trash2 size={16} />
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 设置面板 */}
        {showSettings && (
          <div className="re-card p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">监控设置</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">启用监控</label>
                <button
                  onClick={() => handleSaveSettings({ ...settings, enabled: !settings.enabled })}
                  className={`w-full px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    settings.enabled
                      ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500"
                  }`}
                >
                  {settings.enabled ? "已开启" : "已关闭"}
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">最大条数 (5-100)</label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={settings.maxItems}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(5, parseInt(e.target.value) || 20));
                    setSettings({ ...settings, maxItems: val });
                  }}
                  onBlur={() => handleSaveSettings(settings)}
                  className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">检测间隔 (毫秒)</label>
                <input
                  type="number"
                  min={200}
                  max={5000}
                  step={100}
                  value={settings.monitorIntervalMs}
                  onChange={(e) => {
                    const val = Math.min(5000, Math.max(200, parseInt(e.target.value) || 800));
                    setSettings({ ...settings, monitorIntervalMs: val });
                  }}
                  onBlur={() => handleSaveSettings(settings)}
                  className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 搜索和筛选 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索剪贴板内容..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
              showPinnedOnly
                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                : "border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Filter size={14} />
            置顶
          </button>
        </div>

        {/* 历史列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ClipboardList size={48} className="mb-3 opacity-50" />
            <p className="text-sm">
              {search || showPinnedOnly ? "没有匹配的记录" : "暂无剪贴板历史，复制内容后将自动记录"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="re-card overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-3">
                    {/* 展开/收起 */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="mt-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm text-gray-700 dark:text-gray-300 ${
                          isExpanded ? "whitespace-pre-wrap break-all" : "truncate"
                        }`}
                      >
                        {isExpanded ? entry.content : entry.contentPreview}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-gray-400">
                          {formatTime(entry.timestamp)}
                        </span>
                        <span className="text-[11px] text-gray-300 dark:text-gray-600">
                          {entry.charCount} 字符
                        </span>
                        {entry.pinned && (
                          <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                            <Pin size={10} />
                            已置顶（永久保留）
                          </span>
                        )}
                        {!isExpanded && entry.note && (
                          <span className="text-[10px] text-blue-400 flex items-center gap-0.5 truncate max-w-[150px]">
                            <StickyNote size={10} />
                            {entry.note}
                          </span>
                        )}
                      </div>
                      {/* 展开时显示备注编辑区 */}
                      {isExpanded && (
                        <div className="mt-2">
                          {editingNoteId === entry.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={noteInput}
                                onChange={(e) => setNoteInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveNote(entry.id);
                                  if (e.key === "Escape") cancelEditNote();
                                }}
                                autoFocus
                                placeholder="输入备注..."
                                className="flex-1 px-2 py-1 text-xs rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => saveNote(entry.id)}
                                className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-500 transition-colors"
                                title="保存"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={cancelEditNote}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
                                title="取消"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditNote(entry)}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
                            >
                              <StickyNote size={12} />
                              {entry.note ? entry.note : "添加备注"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleCopy(entry)}
                        className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-500 transition-colors"
                        title="复制"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => handleTogglePin(entry.id)}
                        className={`p-1.5 rounded-md transition-colors ${
                          entry.pinned
                            ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            : "text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        }`}
                        title={entry.pinned ? "取消置顶" : "置顶（不会被队列挤掉）"}
                      >
                        {entry.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
