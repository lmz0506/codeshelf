// 系统监控 - 端口扫描面板。
// 扫描配置（目标、模式、范围、并发等）由 tab 自己持有；
// scanning / scanResults 在父组件管理，因为 Header 的「扫描本地」按钮也要读 scanning。

import { useState } from "react";
import { Network, Play, Square, Loader2 } from "lucide-react";
import { Input, Button } from "@/components/ui";
import type { ScanConfig, ScanResult } from "@/types/toolbox";

type ScanMode = "common" | "range" | "custom";

interface Props {
  scanning: boolean;
  scanResults: ScanResult[];
  commonPorts: number[];
  onScan: (config: ScanConfig) => void | Promise<void>;
  onStop: () => void | Promise<void>;
}

export function SystemMonitorScan({
  scanning,
  scanResults,
  commonPorts,
  onScan,
  onStop,
}: Props) {
  const [target, setTarget] = useState("127.0.0.1");
  const [scanMode, setScanMode] = useState<ScanMode>("common");
  const [portStart, setPortStart] = useState(1);
  const [portEnd, setPortEnd] = useState(1024);
  const [customPorts, setCustomPorts] = useState("");
  const [concurrency, setConcurrency] = useState(100);
  const [timeoutMs, setTimeoutMs] = useState(3000);

  function handleStart() {
    const config: ScanConfig = { target, timeoutMs, concurrency };
    if (scanMode === "common") {
      config.ports = commonPorts;
    } else if (scanMode === "range") {
      config.portStart = portStart;
      config.portEnd = portEnd;
    } else {
      config.ports = customPorts
        .split(",")
        .map((p) => parseInt(p.trim()))
        .filter((p) => !isNaN(p) && p > 0 && p <= 65535);
    }
    onScan(config);
  }

  return (
    <>
      {/* 配置区域 */}
      <div className="re-card p-5 space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">扫描配置</h3>

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

        <div className="flex gap-3 pt-2">
          {!scanning ? (
            <Button onClick={handleStart} variant="primary">
              <Play size={16} className="mr-2" />
              开始扫描
            </Button>
          ) : (
            <Button onClick={() => onStop()} variant="danger">
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
          {!scanning && scanResults.length > 0 && (
            <span className="text-sm text-gray-500">
              发现 {scanResults.length} 个开放端口
            </span>
          )}
        </div>

        {scanResults.length === 0 && !scanning ? (
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
                  <th className="text-left py-3 px-4 font-medium text-gray-500">端口</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">状态</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">服务</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">IP</th>
                </tr>
              </thead>
              <tbody>
                {scanResults.map((result, index) => (
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
  );
}
