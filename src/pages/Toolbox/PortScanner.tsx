import { useState, useEffect } from "react";
import { Network, Play, Square, RefreshCw, Loader2, Trash2 } from "lucide-react";
import { ToolPanelHeader } from "./index";
import { Input, Button } from "@/components/ui";
import {
  scanPorts,
  stopScan,
  getCommonPorts,
  scanLocalDevPorts,
  getLocalPortOccupation,
  killProcess,
} from "@/services/toolbox";
import type { ScanResult, ScanConfig, PortOccupation } from "@/types/toolbox";

interface PortScannerProps {
  onBack: () => void;
}

type ScanMode = "common" | "range" | "custom";
type TabType = "scan" | "occupation";

export function PortScanner({ onBack }: PortScannerProps) {
  const [activeTab, setActiveTab] = useState<TabType>("occupation");

  // 端口扫描状态
  const [target, setTarget] = useState("127.0.0.1");
  const [scanMode, setScanMode] = useState<ScanMode>("common");
  const [portStart, setPortStart] = useState(1);
  const [portEnd, setPortEnd] = useState(1024);
  const [customPorts, setCustomPorts] = useState("");
  const [concurrency, setConcurrency] = useState(100);
  const [timeoutMs, setTimeoutMs] = useState(3000);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [commonPorts, setCommonPorts] = useState<number[]>([]);

  // 端口占用状态
  const [occupations, setOccupations] = useState<PortOccupation[]>([]);
  const [loadingOccupation, setLoadingOccupation] = useState(false);
  const [occupationFilter, setOccupationFilter] = useState("");
  const [showKillConfirm, setShowKillConfirm] = useState<number | null>(null);

  // 加载常用端口列表
  useEffect(() => {
    getCommonPorts().then(setCommonPorts).catch(console.error);
  }, []);

  // 切换到端口占用时自动加载
  useEffect(() => {
    if (activeTab === "occupation" && occupations.length === 0) {
      loadOccupations();
    }
  }, [activeTab]);

  // 加载端口占用
  async function loadOccupations() {
    setLoadingOccupation(true);
    try {
      const data = await getLocalPortOccupation();
      setOccupations(data);
    } catch (error) {
      console.error("获取端口占用失败:", error);
    } finally {
      setLoadingOccupation(false);
    }
  }

  // 开始扫描
  async function handleScan() {
    setScanning(true);
    setResults([]);

    try {
      const config: ScanConfig = {
        target,
        timeoutMs,
        concurrency,
      };

      if (scanMode === "common") {
        config.ports = commonPorts;
      } else if (scanMode === "range") {
        config.portStart = portStart;
        config.portEnd = portEnd;
      } else if (scanMode === "custom") {
        config.ports = customPorts
          .split(",")
          .map((p) => parseInt(p.trim()))
          .filter((p) => !isNaN(p) && p > 0 && p <= 65535);
      }

      const scanResults = await scanPorts(config);
      setResults(scanResults);
    } catch (error) {
      console.error("扫描失败:", error);
    } finally {
      setScanning(false);
    }
  }

  // 停止扫描
  async function handleStop() {
    try {
      await stopScan();
    } catch (error) {
      console.error("停止扫描失败:", error);
    }
    setScanning(false);
  }

  // 快速扫描本地开发端口
  async function handleScanLocalDev() {
    setScanning(true);
    setResults([]);
    setTarget("127.0.0.1");

    try {
      const scanResults = await scanLocalDevPorts();
      setResults(scanResults);
    } catch (error) {
      console.error("扫描失败:", error);
    } finally {
      setScanning(false);
    }
  }

  // 终止进程
  async function handleKill(pid: number) {
    try {
      await killProcess(pid, true);
      setShowKillConfirm(null);
      loadOccupations();
    } catch (error) {
      console.error("终止进程失败:", error);
      alert(`终止进程失败: ${error}`);
    }
  }

  // 过滤端口占用列表
  const filteredOccupations = occupations.filter((item) => {
    if (!occupationFilter) return true;
    const query = occupationFilter.toLowerCase();
    return (
      item.port.toString().includes(query) ||
      item.processName.toLowerCase().includes(query) ||
      item.pid.toString().includes(query)
    );
  });

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="端口扫描"
        icon={Network}
        onBack={onBack}
        actions={
          activeTab === "scan" ? (
            <button
              onClick={handleScanLocalDev}
              disabled={scanning}
              className="re-btn flex items-center gap-2"
              title="快速扫描本地开发端口"
            >
              <RefreshCw size={16} />
              <span>扫描本地</span>
            </button>
          ) : (
            <button
              onClick={loadOccupations}
              disabled={loadingOccupation}
              className="re-btn flex items-center gap-2"
            >
              <RefreshCw size={16} className={loadingOccupation ? "animate-spin" : ""} />
              <span>刷新</span>
            </button>
          )
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Tab 切换 */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab("occupation")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "occupation"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              本地端口占用
            </button>
            <button
              onClick={() => setActiveTab("scan")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "scan"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              端口开放扫描
            </button>
          </div>

          {activeTab === "occupation" ? (
            /* 端口占用面板 */
            <div className="re-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  本地端口占用
                </h3>
                <div className="flex items-center gap-4">
                  <Input
                    value={occupationFilter}
                    onChange={(e) => setOccupationFilter(e.target.value)}
                    placeholder="搜索端口、进程名、PID..."
                    className="w-64"
                  />
                  {!loadingOccupation && occupations.length > 0 && (
                    <span className="text-sm text-gray-500">
                      共 {filteredOccupations.length} 个端口
                    </span>
                  )}
                </div>
              </div>

              {loadingOccupation ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <Loader2 size={32} className="animate-spin mb-4" />
                  <p>加载中...</p>
                </div>
              ) : filteredOccupations.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Network size={48} className="mx-auto mb-4 opacity-50" />
                  <p>{occupationFilter ? "未找到匹配的端口" : "暂无端口占用信息"}</p>
                </div>
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
                      {filteredOccupations.map((item, index) => (
                        <tr
                          key={`${item.port}-${item.protocol}-${item.pid}-${index}`}
                          className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="py-3 px-4 font-mono font-medium text-blue-600">
                            {item.port}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              item.protocol === "tcp"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                            }`}>
                              {item.protocol.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                            {item.processName}
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-500">
                            {item.pid}
                          </td>
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
                            <button
                              onClick={() => setShowKillConfirm(item.pid)}
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
                </div>
              )}
            </div>
          ) : (
            /* 端口扫描面板 */
            <>
              {/* 配置区域 */}
              <div className="re-card p-5 space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  扫描配置
                </h3>

                {/* 目标地址 */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    目标地址
                  </label>
                  <Input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="输入 IP 地址，如 192.168.1.1"
                  />
                </div>

                {/* 扫描模式 */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    扫描模式
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scanMode"
                        checked={scanMode === "common"}
                        onChange={() => setScanMode("common")}
                        className="text-blue-500"
                      />
                      <span className="text-sm">常用端口 ({commonPorts.length}个)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scanMode"
                        checked={scanMode === "range"}
                        onChange={() => setScanMode("range")}
                        className="text-blue-500"
                      />
                      <span className="text-sm">端口范围</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scanMode"
                        checked={scanMode === "custom"}
                        onChange={() => setScanMode("custom")}
                        className="text-blue-500"
                      />
                      <span className="text-sm">自定义端口</span>
                    </label>
                  </div>
                </div>

                {/* 端口范围配置 */}
                {scanMode === "range" && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-500 mb-2">
                        起始端口
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={portStart}
                        onChange={(e) => setPortStart(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-500 mb-2">
                        结束端口
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={portEnd}
                        onChange={(e) => setPortEnd(parseInt(e.target.value) || 65535)}
                      />
                    </div>
                  </div>
                )}

                {/* 自定义端口 */}
                {scanMode === "custom" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      端口列表（逗号分隔）
                    </label>
                    <Input
                      value={customPorts}
                      onChange={(e) => setCustomPorts(e.target.value)}
                      placeholder="如: 80, 443, 8080, 3000"
                    />
                  </div>
                )}

                {/* 高级配置 */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      并发数
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={concurrency}
                      onChange={(e) => setConcurrency(parseInt(e.target.value) || 100)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      超时时间 (ms)
                    </label>
                    <Input
                      type="number"
                      min={100}
                      max={10000}
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(parseInt(e.target.value) || 3000)}
                    />
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-3 pt-2">
                  {!scanning ? (
                    <Button onClick={handleScan} variant="primary">
                      <Play size={16} className="mr-2" />
                      开始扫描
                    </Button>
                  ) : (
                    <Button onClick={handleStop} variant="danger">
                      <Square size={16} className="mr-2" />
                      停止扫描
                    </Button>
                  )}
                </div>
              </div>

              {/* 扫描结果 */}
              <div className="re-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    扫描结果
                  </h3>
                  {scanning && (
                    <div className="flex items-center gap-2 text-blue-500">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-sm">扫描中...</span>
                    </div>
                  )}
                  {!scanning && results.length > 0 && (
                    <span className="text-sm text-gray-500">
                      发现 {results.length} 个开放端口
                    </span>
                  )}
                </div>

                {results.length === 0 && !scanning ? (
                  <div className="text-center py-10 text-gray-400">
                    <Network size={48} className="mx-auto mb-4 opacity-50" />
                    <p>暂无扫描结果</p>
                    <p className="text-sm mt-1">点击"开始扫描"开始检测</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-3 px-4 font-medium text-gray-500">
                            端口
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-500">
                            状态
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-500">
                            服务
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-500">
                            IP
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((result, index) => (
                          <tr
                            key={`${result.ip}-${result.port}-${index}`}
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <td className="py-3 px-4 font-mono font-medium text-blue-600">
                              {result.port}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                开放
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                              {result.service || "-"}
                            </td>
                            <td className="py-3 px-4 text-gray-500 font-mono">
                              {result.ip}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 终止进程确认对话框 */}
      {showKillConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              终止进程
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              确定要终止进程 <span className="font-mono font-medium">{showKillConfirm}</span> 吗？
              这将释放该进程占用的端口。
            </p>
            <div className="flex justify-end gap-3">
              <Button onClick={() => setShowKillConfirm(null)} variant="secondary">
                取消
              </Button>
              <Button onClick={() => handleKill(showKillConfirm)} variant="danger">
                终止
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
