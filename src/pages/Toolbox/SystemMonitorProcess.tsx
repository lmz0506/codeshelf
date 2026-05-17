// 系统监控 - 进程管理面板。
// 系统统计 + 进程列表都由父组件加载；搜索 / 端口过滤的输入框在这里维护。
// 「按端口过滤」按钮把端口号交给父组件，父组件负责切换数据源（getPortProcesses vs loadProcesses）。

import { useState } from "react";
import { ListTree, Search, Trash2 } from "lucide-react";
import { Input, Button } from "@/components/ui";
import { LoadingSpinner } from "@/components/common";
import { formatBytes } from "@/services/toolbox";
import type { ProcessInfo, SystemStats } from "@/types/toolbox";

interface Props {
  processes: ProcessInfo[];
  systemStats: SystemStats | null;
  loading: boolean;
  onFilterByPort: (port: number) => void;
  onKillRequest: (pid: number, name: string) => void;
}

export function SystemMonitorProcess({
  processes,
  systemStats,
  loading,
  onFilterByPort,
  onKillRequest,
}: Props) {
  const [search, setSearch] = useState("");
  const [portInput, setPortInput] = useState("");

  const filtered = processes.filter((proc) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      proc.name.toLowerCase().includes(query) ||
      proc.pid.toString().includes(query) ||
      proc.cmd?.toLowerCase().includes(query)
    );
  });

  function handleApplyPortFilter() {
    const port = parseInt(portInput);
    onFilterByPort(isNaN(port) ? 0 : port);
  }

  return (
    <>
      {/* 系统统计 */}
      {systemStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="re-card p-4">
            <div className="text-sm text-gray-500 mb-1">内存使用</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatBytes(systemStats.usedMemory)} /{" "}
              {formatBytes(systemStats.totalMemory)}
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{
                  width: `${
                    (systemStats.usedMemory / systemStats.totalMemory) * 100
                  }%`,
                }}
              />
            </div>
          </div>
          <div className="re-card p-4">
            <div className="text-sm text-gray-500 mb-1">交换空间</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatBytes(systemStats.usedSwap)} /{" "}
              {formatBytes(systemStats.totalSwap)}
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500"
                style={{
                  width:
                    systemStats.totalSwap > 0
                      ? `${
                          (systemStats.usedSwap / systemStats.totalSwap) * 100
                        }%`
                      : "0%",
                }}
              />
            </div>
          </div>
          <div className="re-card p-4">
            <div className="text-sm text-gray-500 mb-1">CPU 核心数</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {systemStats.cpuCount}
            </div>
          </div>
          <div className="re-card p-4">
            <div className="text-sm text-gray-500 mb-1">进程总数</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {systemStats.processCount}
            </div>
          </div>
        </div>
      )}

      {/* 过滤器 */}
      <div className="re-card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-500 mb-2">
              搜索进程
            </label>
            <div className="relative">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="按名称、PID 或命令搜索..."
              />
              <Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <label className="block text-sm font-medium text-gray-500 mb-2">
              按端口过滤
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                placeholder="端口号"
              />
              <Button onClick={handleApplyPortFilter} variant="secondary">
                过滤
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 进程列表 */}
      <div className="re-card overflow-hidden">
        {loading ? (
          <LoadingSpinner size={32} label="加载中..." className="py-20" />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ListTree size={48} className="mb-4 opacity-50" />
            <p>未找到匹配的进程</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">PID</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">名称</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">端口</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">状态</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">内存</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">CPU</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((proc) => (
                  <tr
                    key={proc.pid}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 px-4 font-mono text-blue-600">
                      {proc.pid}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                      {proc.name}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {proc.port ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          {proc.protocol?.toUpperCase()}:{proc.port}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500">{proc.status}</td>
                    <td className="py-3 px-4 text-gray-500">
                      {formatBytes(proc.memory)}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {proc.cpu.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onKillRequest(proc.pid, proc.name)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                        title="终止进程"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <div className="text-center py-3 text-sm text-gray-500 border-t border-gray-100 dark:border-gray-800">
                显示前 100 条，共 {filtered.length} 条
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
