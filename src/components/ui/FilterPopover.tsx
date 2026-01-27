import { useState, useRef, useEffect } from "react";
import { Filter, Star, GitCommit, X } from "lucide-react";

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

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`re-btn flex items-center gap-2 relative ${
          activeFiltersCount > 0 ? "re-btn-active" : ""
        }`}
        title="过滤器"
      >
        <Filter size={16} />
        <span>过滤</span>
        {activeFiltersCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--primary)] text-white text-xs rounded-full flex items-center justify-center font-semibold">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-[var(--card)] rounded-xl shadow-2xl border border-[var(--border)] z-50 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-light)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text)]">过滤选项</h3>
              {activeFiltersCount > 0 && (
                <button
                  onClick={() => {
                    onStarredChange(false);
                    onModifiedChange(false);
                  }}
                  className="text-xs text-[var(--primary)] hover:underline font-medium flex items-center gap-1"
                >
                  <X size={12} />
                  清除
                </button>
              )}
            </div>
          </div>

          {/* Filter Options */}
          <div className="p-3 space-y-2">
            {/* Starred Filter */}
            <button
              onClick={() => onStarredChange(!onlyStarred)}
              className={`w-full text-left p-4 rounded-lg transition-all ${
                onlyStarred
                  ? "bg-[var(--primary-light)] border-2 border-[var(--primary)]"
                  : "bg-[var(--bg-light)] border-2 border-transparent hover:border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                  onlyStarred ? "bg-[var(--primary)]/10" : "bg-[var(--card)]"
                }`}>
                  <Star className={`w-4 h-4 ${
                    onlyStarred ? "text-[var(--primary)] fill-[var(--primary)]" : "text-[var(--text-light)]"
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-[var(--text)] text-sm">
                    只看收藏
                  </div>
                  <div className="text-xs text-[var(--text-light)] mt-0.5">
                    显示已收藏的项目
                  </div>
                </div>
                <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                  onlyStarred
                    ? "border-[var(--primary)] bg-[var(--primary)]"
                    : "border-[var(--border)]"
                }`}>
                  {onlyStarred && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            </button>

            {/* Modified Filter */}
            <button
              onClick={() => onModifiedChange(!onlyModified)}
              className={`w-full text-left p-4 rounded-lg transition-all ${
                onlyModified
                  ? "bg-[var(--primary-light)] border-2 border-[var(--primary)]"
                  : "bg-[var(--bg-light)] border-2 border-transparent hover:border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                  onlyModified ? "bg-[var(--primary)]/10" : "bg-[var(--card)]"
                }`}>
                  <GitCommit className={`w-4 h-4 ${
                    onlyModified ? "text-[var(--primary)]" : "text-[var(--text-light)]"
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-[var(--text)] text-sm">
                    只看待提交
                  </div>
                  <div className="text-xs text-[var(--text-light)] mt-0.5">
                    显示有未提交修改的项目
                  </div>
                </div>
                <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                  onlyModified
                    ? "border-[var(--primary)] bg-[var(--primary)]"
                    : "border-[var(--border)]"
                }`}>
                  {onlyModified && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          </div>

          {/* Footer Hint */}
          {activeFiltersCount === 0 && (
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-light)]">
              <p className="text-xs text-[var(--text-light)] text-center">
                选择过滤条件以筛选项目
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
