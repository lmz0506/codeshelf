import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Modal, type ModalLevel, type ModalSize } from "./Modal";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** 标题 */
  title: ReactNode;
  /** 可选标题左侧图标 */
  icon?: LucideIcon;
  /** 图标背景色（如 "bg-red-100 dark:bg-red-900/30"），仅在 icon 提供时有意义 */
  iconBg?: string;
  /** 图标颜色（如 "text-red-500"） */
  iconColor?: string;
  /** body 内容 */
  children: ReactNode;
  /** 底部按钮区 */
  footer?: ReactNode;
  /** 是否显示右上 X 关闭按钮，默认 true */
  showCloseButton?: boolean;
  size?: ModalSize;
  level?: ModalLevel;
  closeOnOverlayClick?: boolean;
}

/**
 * 带标题 + body + footer 三段式的 dialog。适合稍微复杂、需要自定义内容的对话框。
 * 简单的"再三确认"用 <ConfirmDialog> / useConfirm 更省事。
 */
export function Dialog({
  open,
  onClose,
  title,
  icon: Icon,
  iconBg = "bg-blue-100 dark:bg-blue-900/30",
  iconColor = "text-blue-500",
  children,
  footer,
  showCloseButton = true,
  size = "md",
  level = "default",
  closeOnOverlayClick = true,
}: DialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size={size}
      level={level}
      closeOnOverlayClick={closeOnOverlayClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className={`p-2 rounded-full flex-shrink-0 ${iconBg}`}>
                <Icon size={18} className={iconColor} />
              </div>
            )}
            <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
              {title}
            </h3>
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex-shrink-0"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </Modal>
  );
}
