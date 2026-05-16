import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** 容器内边距，默认 py-8 */
  className?: string;
}

/**
 * 空态占位：居中图标 + 标题 +（可选）副标题 +（可选）操作按钮。
 *
 * 用法：
 * ```tsx
 * <EmptyState icon={Copy} title="暂无配置档案" description="点击右上角新建一个" />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "py-8",
}: EmptyStateProps) {
  return (
    <div className={`text-center text-gray-400 ${className}`}>
      <Icon size={32} className="mx-auto mb-2 opacity-50" />
      <p className="text-sm">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
