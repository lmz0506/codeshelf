import { useState } from "react";
import { Tag, Check, Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

interface CategorySelectorProps {
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
  multiple?: boolean;
}

export function CategorySelector({
  selectedCategories,
  onChange,
  multiple = true,
}: CategorySelectorProps) {
  const { categories, addCategory } = useAppStore();
  const [showNewInput, setShowNewInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  function toggleCategory(category: string) {
    if (multiple) {
      if (selectedCategories.includes(category)) {
        onChange(selectedCategories.filter((c) => c !== category));
      } else {
        onChange([...selectedCategories, category]);
      }
    } else {
      onChange([category]);
    }
  }

  function handleAddNewCategory() {
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      addCategory(trimmed);
      onChange([...selectedCategories, trimmed]);
    }
    setNewCategory("");
    setShowNewInput(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--text)]">
          选择分类 {multiple && "(可多选)"}
        </label>
        {!showNewInput && (
          <button
            onClick={() => setShowNewInput(true)}
            className="text-xs text-[var(--primary)] hover:underline font-medium flex items-center gap-1"
          >
            <Plus size={12} />
            新建分类
          </button>
        )}
      </div>

      {/* New Category Input */}
      {showNewInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddNewCategory()}
            placeholder="输入新分类名称..."
            autoFocus
            className="flex-1 px-3 py-2 text-sm bg-[var(--bg-light)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
          <button
            onClick={handleAddNewCategory}
            className="px-3 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors text-sm font-medium"
          >
            添加
          </button>
          <button
            onClick={() => {
              setShowNewInput(false);
              setNewCategory("");
            }}
            className="px-3 py-2 border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--bg-light)] transition-colors text-sm"
          >
            取消
          </button>
        </div>
      )}

      {/* Category List */}
      {categories.length === 0 ? (
        <div className="text-center py-6 text-[var(--text-light)] bg-[var(--bg-light)] rounded-lg border border-[var(--border)]">
          <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">还没有分类</p>
          <p className="text-xs mt-1">点击"新建分类"开始</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
          {categories.map((category) => {
            const isSelected = selectedCategories.includes(category);
            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? "border-[var(--primary)] bg-[var(--primary-light)]"
                    : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--bg-light)]"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected
                      ? "bg-[var(--primary)] border-[var(--primary)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
                <span className={`text-sm font-medium truncate ${
                  isSelected ? "text-[var(--primary)]" : "text-[var(--text)]"
                }`}>
                  {category}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedCategories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--text-light)]">已选择:</span>
          {selectedCategories.map((category) => (
            <span
              key={category}
              className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--primary-light)] text-[var(--primary)] rounded text-xs font-medium"
            >
              {category}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
