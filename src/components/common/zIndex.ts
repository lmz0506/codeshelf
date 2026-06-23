/**
 * z-index 命名层级。集中管理避免散落的 z-50 / z-[60] / z-[100]。
 *
 * 当前现状（用作参考）：
 * - 普通模态：z-50（大部分 dialog）
 * - FilterPopover、SkillsPicker 等：z-[60]
 * - Toast、NotificationPanel：通常 z-[100] / z-[200]
 * - ArchMismatchDialog 等系统级：z-[100]
 *
 * 用 Tailwind 任意值语法 `z-[N]` 落地。
 */
export const Z = {
  /** 表头、sticky 元素：低于一切覆盖层 */
  header: 20,
  /** 弹出菜单、下拉、Tooltip */
  popover: 60,
  /** 普通模态对话框 */
  modal: 50,
  /** Toast、通知面板：高于模态 */
  toast: 100,
  /** 系统级提示（架构不匹配、强制更新等）：覆盖一切 */
  system: 200,
} as const;

export type ZLayer = keyof typeof Z;
