import { useState, useEffect } from "react";
import {
  ListTree,
  RefreshCw,
  Search,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { ToolPanelHeader } from "./index";
import { Input, Button } from "@/components/ui";
import {
  getProcesses,
  getPortProcesses,
  killProcess,
  getSystemStats,
  formatBytes,
} from "@/services/toolbox";
import type { ProcessInfo, SystemStats } from "@/types/toolbox";

interface ProcessManagerProps {
  onBack: () => void;
}

export function ProcessManager({ onBack }: ProcessManagerProps) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [portFilter, setPortFilter] = useState("");
  const [showKillConfirm, setShowKillConfirm] = useState<number | null>(null);

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [procs, stats] = await Promise.all([
        getProcesses(),
        getSystemStats(),
      ]);
      setProcesses(procs);
      setSystemStats(stats);
    } catch (error) {
      console.error("加载进程数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 按端口过滤
  async function handlePortFilter() {
    const port = parseInt(portFilter);
    if (isNaN(port) || port <= 0) {
      loadData();
      return;
    }

    setLoading(true);
    try {
      const procs = await getPortProcesses(port);
      setProcesses(procs);
    } catch (error) {
      console.error("过滤进程失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 终止进程
  async function handleKill(pid: number, force: boolean = false) {
    try {
      await killProcess(pid, force);
      setShowKillConfirm(null);
      loadData();
    } catch (error) {
      console.error("终止进程失败:", error);
      alert(`终止进程失败: ${error}`);
    }
  }

  // 过滤进程列表
  const filteredProcesses = processes.filter((proc) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      proc.name.toLowerCase().includes(query) ||
      proc.pid.toString().includes(query) ||
      proc.cmd?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="进程管理"
        icon={ListTree}
        onBack={onBack}
        actions={
          <button
            onClick={loadData}
            disabled={loading}
            className="re-btn flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span>刷新</span>
          </button>
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* 系统统计 */}
          {systemStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="re-card p-4">
                <div className="text-sm text-gray-500 mb-1">内存使用</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatBytes(systemStats.usedMemory)} / {formatBytes(systemStats.totalMemory)}
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${(systemStats.usedMemory / systemStats.totalMemory) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="re-card p-4">
                <div className="text-sm text-gray-500 mb-1">交换空间</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatBytes(systemStats.usedSwap)} / {formatBytes(systemStats.totalSwap)}
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{
                      width: systemStats.totalSwap > 0
                        ? `${(systemStats.usedSwap / systemStats.totalSwap) * 100}%`
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
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                    value={portFilter}
                    onChange={(e) => setPortFilter(e.target.value)}
                    placeholder="端口号"
                  />
                  <Button onClick={handlePortFilter} variant="secondary">
                    过滤
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 进程列表 */}
          <div className="re-card overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Loader2 size={32} className="animate-spin mb-4" />
                <p>加载中...</p>
              </div>
            ) : filteredProcesses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ListTree size={48} className="mb-4 opacity-50" />
                <p>未找到匹配的进程</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        PID
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        名称
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        端口
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        状态
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        内存
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        CPU
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcesses.slice(0, 100).map((proc) => (
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
                            onClick={() => setShowKillConfirm(proc.pid)}
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
                {filteredProcesses.length > 100 && (
                  <div className="text-center py-3 text-sm text-gray-500 border-t border-gray-100 dark:border-gray-800">
                    显示前 100 条，共 {filteredProcesses.length} 条
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 终止确认对话框 */}
      {showKillConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-semibold">终止进程</h3>
            </div>

            <p className="text-gray-600 dark:text-gray-400 mb-6">
              确定要终止进程 <span className="font-mono font-medium">{showKillConfirm}</span> 吗？
            </p>

            <div className="flex justify-end gap-3">
              <Button onClick={() => setShowKillConfirm(null)} variant="secondary">
                取消
              </Button>
              <Button
                onClick={() => handleKill(showKillConfirm, false)}
                variant="danger"
              >
                终止
              </Button>
              <Button
                onClick={() => handleKill(showKillConfirm, true)}
                variant="danger"
              >
                强制终止
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
