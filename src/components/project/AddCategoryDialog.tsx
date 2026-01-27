import { useState } from "react";
import { X, Tag, Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

interface AddCategoryDialogProps {
  onClose: () => void;
}

export function AddCategoryDialog({ onClose }: AddCategoryDialogProps) {
  const { categories, addCategory, removeCategory } = useAppStore();
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState("");

  function handleAddCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) {
      setError("分类名称不能为空");
      return;
    }
    if (categories.includes(trimmed)) {
      setError("该分类已存在");
      return;
    }
    addCategory(trimmed);
    setNewCategory("");
    setError("");
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleAddCategory();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
              <Tag className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--text)]">
              管理分类
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--bg-light)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add New Category */}
        <div className="px-8 py-6 border-b border-[var(--border)]">
          <label className="block text-sm font-medium text-[var(--text)] mb-3">
            添加新分类
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => {
                setNewCategory(e.target.value);
                setError("");
              }}
              onKeyPress={handleKeyPress}
              placeholder="输入分类名称..."
              className="flex-1 px-4 py-2.5 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all"
            />
            <button
              onClick={handleAddCategory}
              className="px-4 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors flex items-center gap-2 font-medium"
            >
              <Plus size={16} />
              添加
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">
              {error}
            </p>
          )}
        </div>

        {/* Category List */}
        <div className="px-8 py-6">
          <label className="block text-sm font-medium text-[var(--text)] mb-3">
            现有分类 ({categories.length})
          </label>
          {categories.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-light)]">
              <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">还没有分类</p>
              <p className="text-xs mt-1">添加分类来组织你的项目</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {categories.map((category) => (
                <div
                  key={category}
                  className="flex items-center justify-between px-4 py-3 bg-[var(--bg-light)] rounded-lg border border-[var(--border)] hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                      <Tag className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    <span className="font-medium text-[var(--text)]">
                      {category}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`确定要删除分类"${category}"吗？\n该分类将从所有项目中移除。`)) {
                        removeCategory(category);
                      }
                    }}
                    className="p-2 text-[var(--text-light)] hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="删除分类"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-8 py-6 border-t border-[var(--border)] bg-[var(--bg-light)]">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors font-medium"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
