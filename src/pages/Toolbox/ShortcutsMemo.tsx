import { useState, useEffect, useMemo } from "react";
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
type CategoryFilter = "all" | "system" | "vscode" | "idea" | "custom";

const CATEGORY_LABELS: Record<string, string> = {
  system: "系统快捷键",
  vscode: "VS Code",
  idea: "IDEA",
  custom: "自定义",
};

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "system", label: "系统" },
  { value: "vscode", label: "VSCode" },
  { value: "idea", label: "IDEA" },
  { value: "custom", label: "自定义" },
];

export function ShortcutsMemo({ onBack }: ShortcutsMemoProps) {
  const [shortcuts, setShortcuts] = useState<ShortcutEntry[]>([]);
  const [platform, setPlatform] = useState<Platform>("windows");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
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
  const [newCategory, setNewCategory] = useState("custom");

  // 重置确认
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 折叠状态
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [data, plat] = await Promise.all([getShortcuts(), getCurrentPlatform()]);
      setShortcuts(data);
      setPlatform(plat as Platform);
    } catch (error) {
      console.error("加载快捷键数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 过滤后的快捷键
  const filtered = useMemo(() => {
    return shortcuts.filter((s) => {
      if (s.platform !== platform) return false;
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
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

  // 按分类分组
  const grouped = useMemo(() => {
    const groups: Record<string, ShortcutEntry[]> = {};
    const order = ["system", "vscode", "idea", "custom"];
    for (const cat of order) {
      const items = filtered.filter((s) => s.category === cat);
      if (items.length > 0) {
        groups[cat] = items;
      }
    }
    // 未知分类放最后
    for (const s of filtered) {
      if (!order.includes(s.category)) {
        if (!groups[s.category]) groups[s.category] = [];
        groups[s.category].push(s);
      }
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
      // 重置后 isModified 变回 false，但后端 update 会保持 isModified=true
      // 所以手动修正
      const fixed: ShortcutEntry = {
        ...updated,
        keys: entry.originalKeys,
        isModified: false,
        originalKeys: undefined,
      };
      // 需要通过 saveShortcuts 写入修正后的数据
      const newList = shortcuts.map((s) => (s.id === entry.id ? fixed : s));
      await saveShortcuts(newList);
      setShortcuts(newList);
    } catch (error) {
      console.error("重置快捷键失败:", error);
    }
  }

  // 删除
  async function handleDelete(id: string) {
    try {
      await deleteShortcut(id);
      setShortcuts((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("删除快捷键失败:", error);
    }
  }

  // 添加
  async function handleAdd() {
    if (!newDesc.trim() || !newKeys.trim()) return;
    try {
      const entry = await addShortcut({
        category: newCategory,
        description: newDesc.trim(),
        keys: newKeys.trim(),
        platform,
      });
      setShortcuts((prev) => [...prev, entry]);
      setShowAddDialog(false);
      setNewDesc("");
      setNewKeys("");
      setNewCategory("custom");
    } catch (error) {
      console.error("添加快捷键失败:", error);
    }
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

      // 标记为非默认并合并去重
      const existing = new Set(shortcuts.map((s) => s.id));
      const newEntries = imported.map((entry) => ({
        ...entry,
        isDefault: false,
        isModified: false,
        originalKeys: undefined,
        id: existing.has(entry.id) ? `imported_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : entry.id,
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
    const parts = keys.split("+").map((k) => k.trim()).filter(Boolean);
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
            <Button variant="ghost" size="sm" onClick={handleImport} title="导入">
              <Upload size={14} className="mr-1" />
              导入
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport} title="导出">
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
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索快捷键..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 分类过滤 */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCategoryFilter(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
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
                  {collapsedCategories.has(category) ? (
                    <ChevronRight size={16} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">({items.length})</span>
                </button>

                {/* 列表项 */}
                {!collapsedCategories.has(category) && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group"
                      >
                        {editingId === entry.id ? (
                          // 编辑模式
                          <>
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              className="flex-1 min-w-0 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="功能描述"
                            />
                            <input
                              type="text"
                              value={editKeys}
                              onChange={(e) => setEditKeys(e.target.value)}
                              className="w-48 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="按键组合"
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
                          // 显示模式
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
                              {entry.isDefault && entry.isModified && entry.originalKeys && (
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
                                  onClick={() => handleDelete(entry.id)}
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
              <div>
                <label className="block text-sm text-gray-500 mb-1">分类</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="custom">自定义</option>
                  <option value="system">系统</option>
                  <option value="vscode">VS Code</option>
                  <option value="idea">IDEA</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">功能描述</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="例如：打开终端"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">按键组合</label>
                <input
                  type="text"
                  value={newKeys}
                  onChange={(e) => setNewKeys(e.target.value)}
                  placeholder="例如：Ctrl + Shift + T"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="text-xs text-gray-400">
                平台：{platform === "mac" ? "Mac" : "Windows"}（跟随当前选择）
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowAddDialog(false);
                  setNewDesc("");
                  setNewKeys("");
                  setNewCategory("custom");
                }}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={!newDesc.trim() || !newKeys.trim()}
              >
                添加
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
