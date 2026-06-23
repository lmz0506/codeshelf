import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import type { McpGatewayStatus } from "./types";

interface Props {
  status: McpGatewayStatus | null;
  fallbackUrl: string;
  busy: boolean;
  onRefresh: () => void;
  onCopy: (url: string) => void;
}

/** 顶部网关状态卡片：跑/没跑、URL、刷新按钮。 */
export function GatewayStatusCard({ status, fallbackUrl, busy, onRefresh, onCopy }: Props) {
  const running = !!status?.running;
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3 bg-white">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {running
            ? <CheckCircle2 size={16} className="text-emerald-500" />
            : <XCircle size={16} className="text-gray-400" />}
          {running ? "流式 HTTP 网关运行中" : "流式 HTTP 网关未启动"}
          <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
            Streamable HTTP
          </span>
        </div>
        {running && status?.url ? (
          <div
            className="text-xs text-gray-500 font-mono mt-1 break-all cursor-copy select-text"
            title="双击复制网关地址"
            onDoubleClick={() => onCopy(status.url || fallbackUrl)}
          >
            {status.url}
          </div>
        ) : (
          <div className="text-xs text-gray-500 mt-1">
            网关由 CodeShelf 面板控制，启动后外部 MCP 客户端连接这里。
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={busy} title="刷新状态">
          <RefreshCw size={15} />
        </Button>
      </div>
    </div>
  );
}
