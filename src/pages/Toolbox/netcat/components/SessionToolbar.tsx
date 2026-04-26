// 会话工具栏组件

import { Play, Square, Eraser, Trash2, Loader2, WifiOff } from "lucide-react";
import { statusConfig, statusText } from "../constants";
import type { NetcatSession, AutoSendConfig } from "@/types/toolbox";

interface SessionToolbarProps {
  session: NetcatSession;
  autoSend: AutoSendConfig;
  loading: string | null;
  onStart: (sessionId: string) => void;
  onStop: (sessionId: string) => void;
  onClear: () => void;
  onRemove: (sessionId: string) => void;
}

export default function SessionToolbar({
  session,
  autoSend,
  loading,
  onStart,
  onStop,
  onClear,
  onRemove,
}: SessionToolbarProps) {
  const Icon = statusConfig[session.status]?.icon || WifiOff;
  const config = statusConfig[session.status] || statusConfig.disconnected;

  return (
    <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <Icon size={18} className={config.color} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-white">
                {session.name}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                {statusText[session.status]}
              </span>
              {autoSend.enabled && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                  <Loader2 size={10} className="animate-spin" />
                  自动发送中
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {session.protocol.toUpperCase()} · {session.host}:{session.port}
              {session.localAddr && (
                <span className="text-green-500"> ← 本地 {session.localAddr}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session.status === "disconnected" || session.status === "error" ? (
            <button
              onClick={() => onStart(session.id)}
              disabled={loading === "start"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading === "start" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {session.mode === "server" ? "启动" : "连接"}
            </button>
          ) : session.status === "connecting" ? (
            <button disabled className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded-lg">
              <Loader2 size={14} className="animate-spin" />
              连接中...
            </button>
          ) : (
            <button
              onClick={() => onStop(session.id)}
              disabled={loading === "stop"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading === "stop" ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
              停止
            </button>
          )}

          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            <Eraser size={14} />
            清空
          </button>

          <button
            onClick={() => onRemove(session.id)}
            disabled={loading === "delete"}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors"
          >
            {loading === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
