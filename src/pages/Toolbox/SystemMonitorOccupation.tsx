// 系统监控 - 端口占用面板。
// 数据由父组件加载（refresh 按钮在 Header 上），过滤条件是 tab 内部状态。
// 内部服务（CodeShelf 自身使用的端口）不允许从这里 kill，提示用户去本地服务页停止。

import { useState } from "react";
import { Network, Trash2 } from "lucide-react";
import { Input } from "@/components/ui";
import { EmptyState, LoadingSpinner } from "@/components/common";
import type { PortOccupation } from "@/types/toolbox";

interface Props {
  occupations: PortOccupation[];
  loading: boolean;
  codeshelfPorts: Set<number>;
  onKillRequest: (pid: number, name: string) => void;
}

export function SystemMonitorOccupation({
  occupations,
  loading,
  codeshelfPorts,
  onKillRequest,
}: Props) {
  const [filter, setFilter] = useState("");

  const filtered = occupations.filter((item) => {
    if (!filter) return true;
    const query = filter.toLowerCase();
    return (
      item.port.toString().includes(query) ||
      item.processName.toLowerCase().includes(query) ||
      item.pid.toString().includes(query)
    );
  });

  function isInternalService(processName: string, port: number): boolean {
    const name = processName.toLowerCase();
    if (name.includes("codeshelf")) return true;
    return codeshelfPorts.has(port);
  }

  return (
    <div className="re-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          本地端口占用
        </h3>
        <div className="flex items-center gap-4">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索端口、进程名、PID..."
            className="w-64"
          />
          {!loading && occupations.length > 0 && (
            <span className="text-sm text-gray-500">
              共 {filtered.length} 个端口
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size={32} label="加载中..." className="py-10" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Network}
          title={filter ? "未找到匹配的端口" : "暂无端口占用信息"}
          className="py-10"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-medium text-gray-500">端口</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">协议</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">进程名</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">PID</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">本地地址</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">状态</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, index) => {
                const isCodeshelfService = isInternalService(
                  item.processName,
                  item.port
                );
                return (
                  <tr
                    key={`${item.port}-${item.protocol}-${item.pid}-${index}`}
                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                      isCodeshelfService ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-medium text-blue-600">
                      <div className="flex items-center gap-2">
                        {item.port}
                        {isCodeshelfService && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500 text-white"
                            title="CodeShelf 内部服务"
                          >
                            内部
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.protocol === "tcp"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                        }`}
                      >
                        {item.protocol.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                      {item.processName}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-500">{item.pid}</td>
                    <td className="py-3 px-4 font-mono text-gray-500 text-xs">
                      {item.localAddr}
                    </td>
                    <td className="py-3 px-4">
                      {item.state && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          {item.state}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isCodeshelfService ? (
                        <span
                          className="text-xs text-gray-400"
                          title="请在本地服务页面停止此服务"
                        >
                          内部服务
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            onKillRequest(item.pid, item.processName)
                          }
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                          title="终止进程"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
