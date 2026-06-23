import { Copy } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  title: string;
  value: string;
  onCopy: () => void;
}

/** 客户端配置代码块（HTTP / Codex TOML 等），统一外观与复制按钮。 */
export function ConfigBlock({ title, value, onCopy }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-gray-700">{title}</div>
        <Button variant="ghost" size="sm" onClick={onCopy} title="复制">
          <Copy size={14} />
        </Button>
      </div>
      <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 max-h-56 overflow-auto bg-white">
        {value}
      </pre>
    </div>
  );
}
