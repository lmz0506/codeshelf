import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface CopyButtonProps {
  text: string;
  /** 区分多个按钮的反馈状态；如果只用一个就不用传 */
  label?: string;
  size?: number;
  className?: string;
  /** 按钮 title（悬停提示） */
  title?: string;
}

/**
 * 复制到剪贴板按钮 + 视觉反馈（成功后 2s 内显示对勾）。
 *
 * 替代 14+ 处「useState + setTimeout + Copy/Check 切换」的手写实现。
 */
export function CopyButton({
  text,
  label = "default",
  size = 14,
  className = "p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded",
  title = "复制",
}: CopyButtonProps) {
  const { copy, copiedLabel } = useCopyToClipboard();
  const isCopied = copiedLabel === label;
  return (
    <button onClick={() => copy(text, label)} className={className} title={title} type="button">
      {isCopied ? (
        <Check size={size} className="text-green-500" />
      ) : (
        <Copy size={size} className="text-gray-400" />
      )}
    </button>
  );
}
