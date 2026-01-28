import { useState, useRef, useEffect } from "react";
import { Filter, Star, GitCommit, X, Check } from "lucide-react";

interface FilterPopoverProps {
  onlyStarred: boolean;
  onlyModified: boolean;
  onStarredChange: (value: boolean) => void;
  onModifiedChange: (value: boolean) => void;
}

export function FilterPopover({
  onlyStarred,
  onlyModified,
  onStarredChange,
  onModifiedChange,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeFiltersCount = [onlyStarred, onlyModified].filter(Boolean).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // 处理键盘事件
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  const filterOptions = [
    {
      id: "starred" as const,
      icon: Star,
      label: "只看收藏",
      description: "显示已收藏的项目",
      checked: onlyStarred,
      onChange: onStarredChange,
      activeColor: "text-yellow-500",
      activeBg: "bg-yellow-50 dark:bg-yellow-500/10",
    },
    {
      id: "modified" as const,
      icon: GitCommit,
      label: "只看待提交",
      description: "显示有未提交修改的项目",
      checked: onlyModified,
      onChange: onModifiedChange,
      activeColor: "text-emerald-500",
      activeBg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
  ];

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`re-btn flex items-center gap-2 relative transition-all duration-200 ${
          isOpen ? "ring-2 ring-[var(--primary)]/30" : ""
        } ${activeFiltersCount > 0 ? "re-btn-active" : ""}`}
        title="过滤器"
      >
        <Filter size={16} />
        <span>过滤</span>
        {activeFiltersCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--primary)] text-white text-xs rounded-full flex items-center justify-center font-semibold shadow-sm">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Popover Panel */}
          <div
            className="absolute top-full right-0 mt-2 w-80 bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200"
            style={{
              boxShadow: "0 20px 50px -12px rgba(0, 0, 0, 0.15), 0 8px 20px -8px rgba(0, 0, 0, 0.1)",
            }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-light)] to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                    <Filter className="w-4 h-4 text-[var(--primary)]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">过滤选项</h3>
                </div>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={() => {
                      onStarredChange(false);
                      onModifiedChange(false);
                    }}
                    className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <X size={12} />
                    清除全部
                  </button>
                )}
              </div>
            </div>

            {/* Filter Options */}
            <div className="p-3 space-y-2">
              {filterOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={() => option.onChange(!option.checked)}
                    className={`w-full text-left p-3.5 rounded-xl transition-all duration-200 group ${
                      option.checked
                        ? "bg-[var(--primary-light)] border-2 border-[var(--primary)]/50"
                        : "bg-[var(--bg-light)] border-2 border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-light)]/80"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Icon */}
                      <div
                        className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          option.checked
                            ? `${option.activeBg} ${option.activeColor}`
                            : "bg-[var(--card)] text-[var(--text-light)] group-hover:text-[var(--text)]"
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 ${option.id === "starred" && option.checked ? "fill-current" : ""}`}
                        />
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[var(--text)] text-sm">
                          {option.label}
                        </div>
                        <div className="text-xs text-[var(--text-light)] mt-0.5">
                          {option.description}
                        </div>
                      </div>

                      {/* Checkbox */}
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                          option.checked
                            ? "border-[var(--primary)] bg-[var(--primary)]"
                            : "border-[var(--border)] group-hover:border-[var(--primary)]/50"
                        }`}
                      >
                        {option.checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-light)]">
              {activeFiltersCount > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-light)]">
                    已启用 {activeFiltersCount} 个过滤条件
                  </span>
                  <span className="text-xs font-medium text-[var(--primary)]">
                    点击选项可切换
                  </span>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-light)] text-center">
                  选择过滤条件以筛选项目列表
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
