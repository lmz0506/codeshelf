// 统计栏组件

import { ArrowUpRight, ArrowDownLeft, Copy, Trash, RefreshCw } from "lucide-react";
import { formatBytes } from "@/services/toolbox";
import type { NetcatSession, NetcatMessage } from "@/types/toolbox";

interface StatsBarProps {
  session: NetcatSession;
  messages: NetcatMessage[];
  autoScroll: boolean;
  onAutoScrollChange: (v: boolean) => void;
  onCopyMessages: () => void;
  onClearPanel: () => void;
  onRefresh: () => void;
}

export default function StatsBar({
  session,
  messages,
  autoScroll,
  onAutoScrollChange,
  onCopyMessages,
  onClearPanel,
  onRefresh,
}: StatsBarProps) {
  return (
    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex items-center gap-6 text-sm">
      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
        <ArrowUpRight size={14} className="text-green-500" />
        发送: <span className="font-medium text-gray-900 dark:text-white">{formatBytes(session.bytesSent)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
        <ArrowDownLeft size={14} className="text-blue-500" />
        接收: <span className="font-medium text-gray-900 dark:text-white">{formatBytes(session.bytesReceived)}</span>
      </div>
      <div className="text-gray-600 dark:text-gray-400">
        消息: <span className="font-medium text-gray-900 dark:text-white">{session.messageCount}</span>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        {/* 复制所有消息 */}
        <button
          onClick={onCopyMessages}
          disabled={messages.length === 0}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          title="复制所有消息"
        >
          <Copy size={14} />
        </button>
        {/* 清除面板消息 */}
        <button
          onClick={onClearPanel}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="清除面板消息"
        >
          <Trash size={14} />
        </button>
        {/* 刷新消息 */}
        <button
          onClick={onRefresh}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="刷新消息"
        >
          <RefreshCw size={14} />
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
        <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => onAutoScrollChange(e.target.checked)}
            className="rounded"
          />
          自动滚动
        </label>
      </div>
    </div>
  );
}
