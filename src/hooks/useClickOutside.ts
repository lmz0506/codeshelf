import { useEffect, type RefObject } from "react";

/**
 * 点击 ref 外部时触发 handler。用 mousedown（早于 click，能在原生 onClick 前关闭）。
 * 与现有 `src/components/ui/Dropdown.tsx` 中的就地实现等价。
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent) => void,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return;
    function onMouseDown(event: MouseEvent) {
      const el = ref.current;
      if (el && !el.contains(event.target as Node)) {
        handler(event);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, handler, enabled]);
}
