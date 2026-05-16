import { useCallback, useEffect, useRef, useState } from "react";

const RESET_DELAY_MS = 2000;

/**
 * 复制到剪贴板 + 反馈状态。
 *
 * `copiedLabel` 在 copy(text, label) 调用 2s 内等于 label，之后清空。
 * 用 label 区分多个按钮的反馈（比如「版本号 / 路径 / 配置目录」共享同一个 hook）。
 */
export function useCopyToClipboard() {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback((text: string, label: string = "default") => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedLabel(null), RESET_DELAY_MS);
    } catch (err) {
      console.warn("复制到剪贴板失败:", err);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { copy, copiedLabel };
}
