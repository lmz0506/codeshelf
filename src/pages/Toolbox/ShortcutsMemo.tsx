import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Keyboard,
  Search,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { ToolPanelHeader } from "./index";
import { Button } from "@/components/ui";
import {
  getShortcuts,
  saveShortcuts,
  addShortcut,
  updateShortcut,
  deleteShortcut,
  resetShortcuts,
  getCurrentPlatform,
} from "@/services/toolbox";
import type { ShortcutEntry } from "@/types/toolbox";

interface ShortcutsMemoProps {
  onBack: () => void;
}

type Platform = "mac" | "windows";

const PRESET_CATEGORIES = ["system", "vscode", "idea"];
const PRESET_LABELS: Record<string, string> = {
  system: "系统快捷键",
  vscode: "VS Code",
  idea: "IDEA",
};

function getCategoryLabel(category: string): string {
  return PRESET_LABELS[category] || category;
}

// ============== 按键名称格式化 ==============

const KEY_NAME_MAP: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Backspace: "Backspace",
  Enter: "Enter",
  Tab: "Tab",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  CapsLock: "CapsLock",
  PrintScreen: "Print Screen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  ContextMenu: "Menu",
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

function formatKeyName(key: string): string {
  if (KEY_NAME_MAP[key]) return KEY_NAME_MAP[key];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function getModifierLabel(mod: string, platform: Platform): string {
  const labels: Record<string, Record<Platform, string>> = {
    ctrl: { mac: "Control", windows: "Ctrl" },
    alt: { mac: "Option", windows: "Alt" },
    shift: { mac: "Shift", windows: "Shift" },
    meta: { mac: "Command", windows: "Win" },
  };
  return labels[mod]?.[platform] || mod;
}

// ============== 按键录入组件 ==============

function KeyRecorderInput({
  value,
  onChange,
  platform,
  placeholder,
  className,
}: {
  value: string;
  onChange: (keys: string) => void;
  platform: Platform;
  placeholder?: string;
  className?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        setPreview("");
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push(getModifierLabel("ctrl", platform));
      if (e.altKey) parts.push(getModifierLabel("alt", platform));
      if (e.shiftKey) parts.push(getModifierLabel("shift", platform));
      if (e.metaKey) parts.push(getModifierLabel("meta", platform));

      if (!MODIFIER_KEYS.has(e.key)) {
        parts.push(formatKeyName(e.key));
        onChange(parts.join(" + "));
        setRecording(false);
        setPreview("");
      } else {
        setPreview(parts.join(" + ") + " + ...");
      }
    },
    [recording, platform, onChange]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push(getModifierLabel("ctrl", platform));
      if (e.altKey) parts.push(getModifierLabel("alt", platform));
      if (e.shiftKey) parts.push(getModifierLabel("shift", platform));
      if (e.metaKey) parts.push(getModifierLabel("meta", platform));
      setPreview(parts.length > 0 ? parts.join(" + ") + " + ..." : "");
    },
    [recording, platform]
  );

  function toggleRecording() {
    const next = !recording;
    setRecording(next);
    setPreview("");
    if (next) inputRef.current?.focus();
  }

  return (
    <div className={`relative ${className || ""}`}>
      <input
        ref={inputRef}
        type="text"
        value={recording ? preview : value}
        onChange={(e) => {
          if (!recording) onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => {
          if (recording) {
            setRecording(false);
            setPreview("");
          }
        }}
        readOnly={recording}
        placeholder={recording ? "按下快捷键组合..." : placeholder}
        className={`w-full pr-8 px-2 py-1 text-sm bg-white dark:bg-gray-800 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          recording
            ? "border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10 placeholder-red-400 dark:placeholder-red-500"
            : "border-gray-300 dark:border-gray-600"
        }`}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          toggleRecording();
        }}
        className={`absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${
          recording
            ? "text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
            : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        }`}
        title={recording ? "停止录制 (Esc)" : "按键录入"}
      >
        <Keyboard
          size={14}
          className={recording ? "animate-pulse" : ""}
        />
      </button>
    </div>
  );
}

// ============== 主组件 ==============

export function ShortcutsMemo({ onBack }: ShortcutsMemoProps) {
  const [shortcuts, setShortcuts] = useState<ShortcutEntry[]>([]);
  const [platform, setPlatform] = useState<Platform>("windows");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editKeys, setEditKeys] = useState("");

  // 添加弹窗
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newKeys, setNewKeys] = useState("");
  const [newCategory, setNewCategory] = useState("__new__");
  const [newCategoryName, setNewCategoryName] = useState("");

  // 删除确认
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<ShortcutEntry | null>(null);

  // 重置确认
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 折叠状态
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );

  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [data, plat] = await Promise.all([
        getShortcuts(),
        getCurrentPlatform(),
      ]);
      setShortcuts(data);
      setPlatform(plat as Platform);
    } catch (error) {
      console.error("加载快捷键数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 已有的自定义分类名
  const existingCustomCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const s of shortcuts) {
      if (!PRESET_CATEGORIES.includes(s.category)) {
        cats.add(s.category);
      }
    }
    return Array.from(cats).sort();
  }, [shortcuts]);

  // 动态分类过滤选项
  const categoryOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: "all", label: "全部" },
      { value: "system", label: "系统" },
      { value: "vscode", label: "VSCode" },
      { value: "idea", label: "IDEA" },
    ];
    for (const cat of existingCustomCategories) {
      opts.push({ value: cat, label: cat });
    }
    return opts;
  }, [existingCustomCategories]);

  // 过滤后的快捷键
  const filtered = useMemo(() => {
    return shortcuts.filter((s) => {
      if (s.platform !== platform) return false;
      if (categoryFilter !== "all" && s.category !== categoryFilter)
        return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.description.toLowerCase().includes(q) ||
          s.keys.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [shortcuts, platform, categoryFilter, searchQuery]);

  // 按分类分组（预设分类在前，自定义分类按字母排序在后）
  const grouped = useMemo(() => {
    const groups: Record<string, ShortcutEntry[]> = {};

    for (const cat of PRESET_CATEGORIES) {
      const items = filtered.filter((s) => s.category === cat);
      if (items.length > 0) groups[cat] = items;
    }

    const customCats: string[] = [];
    for (const s of filtered) {
      if (
        !PRESET_CATEGORIES.includes(s.category) &&
        !customCats.includes(s.category)
      ) {
        customCats.push(s.category);
      }
    }
    customCats.sort();
    for (const cat of customCats) {
      groups[cat] = filtered.filter((s) => s.category === cat);
    }

    return groups;
  }, [filtered]);

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function isCategoryExpanded(cat: string): boolean {
    if (isSearching) return true;
    return !collapsedCategories.has(cat);
  }

  // 开始编辑
  function startEdit(entry: ShortcutEntry) {
    setEditingId(entry.id);
    setEditDesc(entry.description);
    setEditKeys(entry.keys);
  }

  // 保存编辑
  async function saveEdit() {
    if (!editingId) return;
    try {
      const updated = await updateShortcut(editingId, {
        description: editDesc,
        keys: editKeys,
      });
      setShortcuts((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      setEditingId(null);
    } catch (error) {
      console.error("更新快捷键失败:", error);
    }
  }

  // 重置单个默认项
  async function resetSingle(entry: ShortcutEntry) {
    if (!entry.originalKeys) return;
    try {
      const updated = await updateShortcut(entry.id, {
        keys: entry.originalKeys,
        description: entry.description,
      });
      const fixed: ShortcutEntry = {
        ...updated,
        keys: entry.originalKeys,
        isModified: false,
        originalKeys: undefined,
      };
      const newList = shortcuts.map((s) => (s.id === entry.id ? fixed : s));
      await saveShortcuts(newList);
      setShortcuts(newList);
    } catch (error) {
      console.error("重置快捷键失败:", error);
    }
  }

  // 删除确认 + 执行
  async function confirmDelete() {
    if (!deleteConfirmEntry) return;
    try {
      await deleteShortcut(deleteConfirmEntry.id);
      setShortcuts((prev) =>
        prev.filter((s) => s.id !== deleteConfirmEntry.id)
      );
      setDeleteConfirmEntry(null);
    } catch (error) {
      console.error("删除快捷键失败:", error);
    }
  }

  // 添加
  async function handleAdd() {
    if (!newDesc.trim() || !newKeys.trim()) return;
    const actualCategory =
      newCategory === "__new__" ? newCategoryName.trim() : newCategory;
    if (!actualCategory) return;
    try {
      const entry = await addShortcut({
        category: actualCategory,
        description: newDesc.trim(),
        keys: newKeys.trim(),
        platform,
      });
      setShortcuts((prev) => [...prev, entry]);
      closeAddDialog();
    } catch (error) {
      console.error("添加快捷键失败:", error);
    }
  }

  function closeAddDialog() {
    setShowAddDialog(false);
    setNewDesc("");
    setNewKeys("");
    setNewCategory("__new__");
    setNewCategoryName("");
  }

  // 重置
  async function handleReset() {
    try {
      const data = await resetShortcuts();
      setShortcuts(data);
      setShowResetConfirm(false);
    } catch (error) {
      console.error("重置快捷键失败:", error);
    }
  }

  // 导出
  async function handleExport() {
    try {
      const exportData = shortcuts.filter((s) => s.platform === platform);
      const json = JSON.stringify(exportData, null, 2);
      const filePath = await save({
        defaultPath: `shortcuts_${platform}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, json);
      }
    } catch (error) {
      console.error("导出失败:", error);
    }
  }

  // 导入
  async function handleImport() {
    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;

      const content = await readTextFile(filePath as string);
      const imported: ShortcutEntry[] = JSON.parse(content);

      if (!Array.isArray(imported)) {
        throw new Error("无效的快捷键数据格式");
      }

      const existing = new Set(shortcuts.map((s) => s.id));
      const newEntries = imported.map((entry) => ({
        ...entry,
        isDefault: false,
        isModified: false,
        originalKeys: undefined,
        id: existing.has(entry.id)
          ? `imported_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          : entry.id,
      }));

      const merged = [...shortcuts, ...newEntries];
      await saveShortcuts(merged);
      setShortcuts(merged);
    } catch (error) {
      console.error("导入失败:", error);
    }
  }

  // 渲染按键标签
  function renderKeys(keys: string) {
    const parts = keys
      .split("+")
      .map((k) => k.trim())
      .filter(Boolean);
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {parts.map((part, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-gray-400 text-xs">+</span>}
            <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm text-gray-700 dark:text-gray-300 min-w-[1.5rem] text-center">
              {part}
            </kbd>
          </span>
        ))}
      </span>
    );
  }

  const addDisabled =
    !newDesc.trim() ||
    !newKeys.trim() ||
    (newCategory === "__new__" && !newCategoryName.trim());

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <ToolPanelHeader title="快捷键备忘" icon={Keyboard} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ToolPanelHeader
        title="快捷键备忘"
        icon={Keyboard}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleImport}
              title="导入"
            >
              <Upload size={14} className="mr-1" />
              导入
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              title="导出"
            >
              <Download size={14} className="mr-1" />
              导出
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              title="重置默认"
            >
              <RotateCcw size={14} className="mr-1" />
              重置
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus size={14} className="mr-1" />
              添加
            </Button>
          </div>
        }
      />

      {/* 工具栏: 平台切换 + 搜索 + 分类过滤 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 flex-wrap">
        {/* 平台切换 */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setPlatform("mac")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              platform === "mac"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Mac
          </button>
          <button
            onClick={() => setPlatform("windows")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              platform === "windows"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Windows
          </button>
        </div>

        {/* 搜索框 */}
        <div className="flex-1 min-w-[200px] max-w-[320px] relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="搜索快捷键..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 分类过滤 */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-wrap gap-0.5">
          {categoryOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCategoryFilter(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                categoryFilter === opt.value
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 快捷键列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Keyboard size={48} className="mb-4 opacity-50" />
            <p className="text-sm">没有匹配的快捷键</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="re-card overflow-hidden">
                {/* 分类标题 */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  {isCategoryExpanded(category) ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {getCategoryLabel(category)}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">
                    ({items.length})
                  </span>
                </button>

                {/* 列表项 */}
                {isCategoryExpanded(category) && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group"
                      >
                        {editingId === entry.id ? (
                          <>
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              className="flex-1 min-w-0 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="功能描述"
                            />
                            <KeyRecorderInput
                              value={editKeys}
                              onChange={setEditKeys}
                              platform={platform}
                              placeholder="按键组合"
                              className="w-52"
                            />
                            <button
                              onClick={saveEdit}
                              className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                              title="保存"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                              title="取消"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 truncate">
                              {entry.description}
                            </span>
                            <div className="flex-shrink-0">
                              {renderKeys(entry.keys)}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button
                                onClick={() => startEdit(entry)}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                title="编辑"
                              >
                                <Pencil size={13} />
                              </button>
                              {entry.isDefault &&
                                entry.isModified &&
                                entry.originalKeys && (
                                  <button
                                    onClick={() => resetSingle(entry)}
                                    className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded"
                                    title="恢复默认"
                                  >
                                    <RotateCcw size={13} />
                                  </button>
                                )}
                              {!entry.isDefault && (
                                <button
                                  onClick={() => setDeleteConfirmEntry(entry)}
                                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                  title="删除"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加弹窗 */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="re-card w-[420px] p-5 mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              添加快捷键
            </h3>

            <div className="space-y-3">
              {/* 分类选择 */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">
                  分类
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="system">系统</option>
                  <option value="vscode">VS Code</option>
                  <option value="idea">IDEA</option>
                  {existingCustomCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__new__">+ 新建分类...</option>
                </select>
              </div>

              {/* 自定义分类名 */}
              {newCategory === "__new__" && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    分类名称
                  </label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="输入自定义分类名称"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
              )}

              {/* 功能描述 */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">
                  功能描述
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="例如：打开终端"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* 按键组合 - 支持手动输入或按键录入 */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">
                  按键组合
                  <span className="text-gray-400 ml-1 font-normal">
                    (手动输入或点击右侧图标录入)
                  </span>
                </label>
                <KeyRecorderInput
                  value={newKeys}
                  onChange={setNewKeys}
                  platform={platform}
                  placeholder="例如：Ctrl + Shift + T"
                  className="[&_input]:!px-3 [&_input]:!py-2 [&_input]:!rounded-lg [&_input]:!border-gray-200 [&_input]:dark:!border-gray-700"
                />
              </div>

              <div className="text-xs text-gray-400">
                平台：{platform === "mac" ? "Mac" : "Windows"}（跟随当前选择）
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" size="sm" onClick={closeAddDialog}>
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={addDisabled}
              >
                添加
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="re-card w-[380px] p-5 mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
              删除快捷键
            </h3>
            <p className="text-sm text-gray-500 mb-1">
              确定要删除以下快捷键吗？
            </p>
            <div className="flex items-center gap-2 py-2 px-3 my-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                {deleteConfirmEntry.description}
              </span>
              <span className="text-gray-400 mx-1">-</span>
              {renderKeys(deleteConfirmEntry.keys)}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteConfirmEntry(null)}
              >
                取消
              </Button>
              <Button variant="danger" size="sm" onClick={confirmDelete}>
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 重置确认弹窗 */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="re-card w-[380px] p-5 mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
              重置快捷键
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              恢复所有默认快捷键到初始状态，保留您的自定义快捷键。确定要继续吗？
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowResetConfirm(false)}
              >
                取消
              </Button>
              <Button variant="danger" size="sm" onClick={handleReset}>
                确认重置
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
