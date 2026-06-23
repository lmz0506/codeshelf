import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MacWindowControls } from "@/components/layout/MacWindowControls";

interface PageHeaderProps {
  /** 主标题（含 emoji） */
  title: ReactNode;
  /** 副标题，在标题下方 */
  subtitle?: ReactNode;
  /** 标题前置 emoji（如果你的 title 已经带 emoji 可不传） */
  icon?: LucideIcon;
  /** 左侧侧边栏折叠按钮回调；不传则不显示 ☰ */
  onToggleSidebar?: () => void;
  /** 中间自由插槽：放模型选择器、状态徽章、搜索框等 */
  children?: ReactNode;
  /** 右侧动作按钮组（不含 MacWindowControls，本组件会自动末尾追加） */
  actions?: ReactNode;
  /** sticky 模式；默认 true（适合 Chat、AiProviders 等滚动页）；
   *  false 等价于 flex-shrink-0（适合 Dashboard、Toolbox 这种整页布局） */
  sticky?: boolean;
}

/**
 * 统一的页面顶栏：sidebar 折叠按钮 + 标题/副标题 + 自由插槽 + 动作 + macOS 窗口控件。
 *
 * 关键约束：
 * - header 元素本身带 `data-tauri-drag-region`（可拖动）
 * - 标题外层 div 也带 drag-region
 * - children / actions 由调用方负责自行避免给可点元素加 drag-region
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  onToggleSidebar,
  children,
  actions,
  sticky = true,
}: PageHeaderProps) {
  const positionClass = sticky ? "sticky top-0 z-20" : "flex-shrink-0";
  return (
    <header className={`re-header ${positionClass}`} data-tauri-drag-region>
      {onToggleSidebar && (
        <span className="toggle" onClick={onToggleSidebar}>☰</span>
      )}

      <div className={subtitle ? "flex flex-col" : "flex-1 flex items-center gap-3"} data-tauri-drag-region>
        <span className="text-lg font-semibold ml-2 flex items-center gap-2">
          {Icon && <Icon size={18} />}
          {title}
        </span>
        {subtitle && <span className="text-xs text-gray-500 ml-2">{subtitle}</span>}
      </div>

      {children && !subtitle && (
        <div className="flex items-center gap-3">{children}</div>
      )}

      <div className={`re-actions flex items-center ${subtitle ? "ml-auto" : ""} gap-3`}>
        {subtitle && children}
        {actions}
        <MacWindowControls />
      </div>
    </header>
  );
}
