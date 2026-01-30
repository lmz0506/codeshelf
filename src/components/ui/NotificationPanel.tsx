import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  X,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import type { Notification } from "@/types";

const typeIcons: Record<Notification["type"], typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const typeColors: Record<Notification["type"], string> = {
  success: "text-green-500",
  error: "text-red-500",
  warning: "text-yellow-500",
  info: "text-blue-500",
};

const typeBgColors: Record<Notification["type"], string> = {
  success: "bg-green-50 dark:bg-green-900/20 border-l-green-500",
  error: "bg-red-50 dark:bg-red-900/20 border-l-red-500",
  warning: "bg-yellow-50 dark:bg-yellow-900/20 border-l-yellow-500",
  info: "bg-blue-50 dark:bg-blue-900/20 border-l-blue-500",
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;

  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const { notifications, removeNotification, clearAllNotifications } =
    useAppStore();

  // ESC 键关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open]);

  const unreadCount = notifications.length;

  return (
    <>
      {/* 通知铃铛按钮 */}
      <button
        onClick={() => setOpen(true)}
        className={`relative p-1.5 rounded-lg transition-colors ${
          open
            ? "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400"
            : "text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"
        }`}
        title="消息通知"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* 模态框 - 使用 Portal 渲染到 body */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ animation: "fadeIn 0.15s ease-out" }}
          >
            {/* 遮罩层 */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* 模态框内容 */}
            <div
              className="relative w-[420px] max-h-[70vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
              style={{ animation: "scaleIn 0.2s ease-out" }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-500" />
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    消息通知
                  </h3>
                  {notifications.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                      {notifications.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAllNotifications}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="清空所有通知"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      清空
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="关闭"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* 通知列表 */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                    <Bell className="w-12 h-12 mb-3 opacity-30" />
                    <span className="text-sm">暂无通知</span>
                    <span className="text-xs mt-1 opacity-70">操作消息会显示在这里</span>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {notifications.map((n) => {
                      const Icon = typeIcons[n.type];
                      return (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border-l-4 transition-colors group ${typeBgColors[n.type]}`}
                        >
                          <Icon
                            className={`w-5 h-5 mt-0.5 flex-shrink-0 ${typeColors[n.type]}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {n.title}
                            </p>
                            {n.message && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 break-words">
                                {n.message}
                              </p>
                            )}
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                              {formatTime(n.createdAt)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(n.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-all flex-shrink-0"
                            title="删除此通知"
                          >
                            <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 底部 */}
              <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-center flex-shrink-0 bg-gray-50 dark:bg-gray-900/50">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  最多保留最近 10 条通知，超出自动删除旧消息
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 动画样式 */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
