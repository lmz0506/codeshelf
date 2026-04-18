import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

export interface PendingApproval {
  id: string;
  name: string;
  argumentsJson: string;
}

interface ToolApprovalDialogProps {
  pending: PendingApproval | null;
  onDecide: (decision: "once" | "always" | "reject") => void;
}

export function ToolApprovalDialog({ pending, onDecide }: ToolApprovalDialogProps) {
  const parsed = useMemo(() => {
    if (!pending) return null;
    try {
      return JSON.stringify(JSON.parse(pending.argumentsJson), null, 2);
    } catch {
      return pending.argumentsJson;
    }
  }, [pending]);

  if (!pending) return null;

  const destructive = pending.name === "Write" || pending.name === "Edit" || pending.name === "Bash";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg w-[560px] max-w-[90vw] p-5 space-y-4 shadow-xl">
        <div className="flex items-center gap-2">
          {destructive && <AlertTriangle size={18} className="text-amber-500" />}
          <div className="text-base font-semibold">助手请求执行工具</div>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-gray-500">工具名称</div>
          <div className={`font-mono text-sm px-2 py-1 rounded ${destructive ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-gray-100 text-gray-800"}`}>
            {pending.name}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-gray-500">参数</div>
          <pre className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">
            {parsed}
          </pre>
        </div>
        {destructive && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ 这类工具会修改文件或执行命令，请确认参数无误。
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
            onClick={() => onDecide("reject")}
          >
            拒绝
          </button>
          <button
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
            onClick={() => onDecide("always")}
            title="本会话后续该工具不再询问"
          >
            本会话始终允许
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
            onClick={() => onDecide("once")}
          >
            仅此一次执行
          </button>
        </div>
      </div>
    </div>
  );
}
