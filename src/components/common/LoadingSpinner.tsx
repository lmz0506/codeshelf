import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * 单一加载图标。最常见用法 `<LoadingSpinner />` 等价于 `<Loader2 className="animate-spin" size={16} />`。
 * 带 label 时垂直堆叠（适合占满区域的 loading 态）。
 */
export function LoadingSpinner({ size = 16, className = "", label }: LoadingSpinnerProps) {
  if (label) {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-400 ${className}`}>
        <Loader2 size={size} className="animate-spin mb-2" />
        <p className="text-sm">{label}</p>
      </div>
    );
  }
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}
