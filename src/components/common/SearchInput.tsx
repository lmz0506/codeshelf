import { Search, X } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 自动聚焦 */
  autoFocus?: boolean;
  /** 按 Enter 触发 */
  onSubmit?: () => void;
  /** Esc 行为：默认清空，传 onEscape 自定义 */
  onEscape?: () => void;
  className?: string;
}

/**
 * 搜索输入框：左侧 Search 图标 + 有值时右侧 X 清除。
 *
 * 不替你管 debounce，调用方按需 wrap。
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "搜索...",
  autoFocus,
  onSubmit,
  onEscape,
  className = "",
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) onSubmit();
          else if (e.key === "Escape") {
            if (onEscape) onEscape();
            else onChange("");
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          title="清空"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
