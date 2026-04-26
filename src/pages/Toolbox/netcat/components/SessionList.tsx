// 左侧会话列表组件

import { Plus, Radio, Timer } from "lucide-react";
import { statusConfig, statusText } from "../constants";
import type { NetcatSession } from "@/types/toolbox";

interface SessionListProps {
  sessions: NetcatSession[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
}

export default function SessionList({
  sessions,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
}: SessionListProps) {
  return (
    <div className="w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 dark:text-white">会话列表</h3>
          <button
            onClick={onCreateSession}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={14} />
            新建
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {sessions.length} 个会话
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Radio size={32} className="mb-2 opacity-50" />
            <p className="text-sm">暂无会话</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => {
              const config = statusConfig[session.status] || statusConfig.disconnected;
              const StatusIcon = config.icon;
              const hasAutoSend = session.autoSend?.enabled;
              return (
                <div
                  key={session.id}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedSessionId === session.id
                      ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
                      : "bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <StatusIcon size={16} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {session.name}
                        </span>
                        {hasAutoSend && (
                          <Timer size={12} className="text-orange-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className={`px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                          {statusText[session.status]}
                        </span>
                        <span>{session.protocol.toUpperCase()}</span>
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {session.host}:{session.port}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 小提示 */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
          💡 服务端启动失败？可能是端口占用，重启 CodeShelf 即可解决
        </p>
      </div>
    </div>
  );
}
