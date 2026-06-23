import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Z } from "./zIndex";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";
export type ModalLevel = "default" | "system";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 卡片最大宽度 */
  size?: ModalSize;
  /** 渲染层级；system 会自动用更高的 z-index */
  level?: ModalLevel;
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlayClick?: boolean;
  /** ESC 是否关闭，默认 true */
  closeOnEsc?: boolean;
  /** 自定义遮罩 className（不常用） */
  overlayClassName?: string;
  /** 是否让内容区填满（如 ChatOverlay 用 full）。默认 false 会居中卡片 */
  fullScreen?: boolean;
}

const SIZE_MAX_WIDTH: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-none",
};

/**
 * 底层模态遮罩，portal 到 document.body。
 *
 * 设计点：
 * - 默认 `top-8` 偏移，避开 Tauri 32px 标题栏。`level="system"` 时贴顶。
 * - 通过 `createPortal` 渲染避免 transformed 祖先导致的 fixed 失效。
 * - ESC / 点遮罩关闭可关。
 * - children 是卡片内容；调用方负责卡片本身的样式（bg、padding、rounded）。
 */
export function Modal({
  open,
  onClose,
  children,
  size = "md",
  level = "default",
  closeOnOverlayClick = true,
  closeOnEsc = true,
  overlayClassName = "",
  fullScreen = false,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const zIndex = level === "system" ? Z.system : Z.modal;
  const topOffset = level === "system" ? "inset-0" : "inset-0 top-8";

  return createPortal(
    <div
      className={`fixed ${topOffset} flex items-center justify-center bg-black/40 ${overlayClassName}`}
      style={{ zIndex }}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={fullScreen ? "w-full h-full" : `w-full ${SIZE_MAX_WIDTH[size]} mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
