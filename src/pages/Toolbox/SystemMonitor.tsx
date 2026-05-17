import { useState, useEffect } from "react";
import {
  Activity,
  Network,
  ListTree,
  RefreshCw,
  Search,
} from "lucide-react";
import { ToolPanelHeader } from "./index";
import {
  scanPorts,
  stopScan,
  getCommonPorts,
  scanLocalDevPorts,
  getLocalPortOccupation,
  getProcesses,
  getPortProcesses,
  killProcess,
  getSystemStats,
  getServers,
  getForwardRules,
} from "@/services/toolbox";
import type {
  ScanResult,
  ScanConfig,
  PortOccupation,
  ProcessInfo,
  SystemStats,
} from "@/types/toolbox";
import { SystemMonitorOccupation } from "./SystemMonitorOccupation";
import { SystemMonitorScan } from "./SystemMonitorScan";
import { SystemMonitorProcess } from "./SystemMonitorProcess";
import { SystemMonitorKillConfirm } from "./SystemMonitorKillConfirm";

interface SystemMonitorProps {
  onBack: () => void;
}

type TabType = "scan" | "occupation" | "process";

interface KillTarget {
  pid: number;
  name: string;
  source: "occupation" | "process";
}

export function SystemMonitor({ onBack }: SystemMonitorProps) {
  const [activeTab, setActiveTab] = useState<TabType>("occupation");

  // 端口扫描数据（配置项在 ScanTab 内）
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [commonPorts, setCommonPorts] = useState<number[]>([]);

  // 端口占用数据
  const [occupations, setOccupations] = useState<PortOccupation[]>([]);
  const [loadingOccupation, setLoadingOccupation] = useState(false);
  // CodeShelf 内部服务占用的端口（用于在 occupation 表格里标记 + 禁止 kill）
  const [codeshelfPorts, setCodeshelfPorts] = useState<Set<number>>(new Set());

  // 进程数据
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loadingProcesses, setLoadingProcesses] = useState(false);

  // 终止进程确认：source 用于 kill 成功后刷新对应 tab 的数据
  const [killTarget, setKillTarget] = useState<KillTarget | null>(null);

  useEffect(() => {
    getCommonPorts().then(setCommonPorts).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === "occupation" && occupations.length === 0) {
      loadOccupations();
    } else if (activeTab === "process" && processes.length === 0) {
      loadProcesses();
    }
  }, [activeTab]);

  async function loadOccupations() {
    setLoadingOccupation(true);
    try {
      const [data, servers, rules] = await Promise.all([
        getLocalPortOccupation(),
        getServers(),
        getForwardRules(),
      ]);
      setOccupations(data);

      const internalPorts = new Set<number>();
      servers.forEach((s) => {
        if (s.status === "running") internalPorts.add(s.port);
      });
      rules.forEach((r) => {
        if (r.status === "running") internalPorts.add(r.localPort);
      });
      setCodeshelfPorts(internalPorts);
    } catch (error) {
      console.error("获取端口占用失败:", error);
    } finally {
      setLoadingOccupation(false);
    }
  }

  async function loadProcesses() {
    setLoadingProcesses(true);
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
      setLoadingProcesses(false);
    }
  }

  async function handleScan(config: ScanConfig) {
    setScanning(true);
    setScanResults([]);
    try {
      const results = await scanPorts(config);
      setScanResults(results);
    } catch (error) {
      console.error("扫描失败:", error);
    } finally {
      setScanning(false);
    }
  }

  async function handleStop() {
    try {
      await stopScan();
    } catch (error) {
      console.error("停止扫描失败:", error);
    }
    setScanning(false);
  }

  async function handleScanLocalDev() {
    setScanning(true);
    setScanResults([]);
    try {
      const results = await scanLocalDevPorts();
      setScanResults(results);
    } catch (error) {
      console.error("扫描失败:", error);
    } finally {
      setScanning(false);
    }
  }

  async function handleFilterByPort(port: number) {
    if (port <= 0) {
      loadProcesses();
      return;
    }
    setLoadingProcesses(true);
    try {
      const procs = await getPortProcesses(port);
      setProcesses(procs);
    } catch (error) {
      console.error("过滤进程失败:", error);
    } finally {
      setLoadingProcesses(false);
    }
  }

  async function handleKill(pid: number, force: boolean) {
    const source = killTarget?.source;
    try {
      await killProcess(pid, force);
      setKillTarget(null);
      if (source === "occupation") {
        loadOccupations();
      } else {
        loadProcesses();
      }
    } catch (error) {
      console.error("终止进程失败:", error);
      alert(`终止进程失败: ${error}`);
    }
  }

  const renderHeaderActions = () => {
    if (activeTab === "scan") {
      return (
        <button
          onClick={handleScanLocalDev}
          disabled={scanning}
          className="re-btn flex items-center gap-2"
          title="快速扫描本地开发端口"
        >
          <RefreshCw size={16} />
          <span>扫描本地</span>
        </button>
      );
    }
    if (activeTab === "occupation") {
      return (
        <button
          onClick={loadOccupations}
          disabled={loadingOccupation}
          className="re-btn flex items-center gap-2"
        >
          <RefreshCw
            size={16}
            className={loadingOccupation ? "animate-spin" : ""}
          />
          <span>刷新</span>
        </button>
      );
    }
    return (
      <button
        onClick={loadProcesses}
        disabled={loadingProcesses}
        className="re-btn flex items-center gap-2"
      >
        <RefreshCw
          size={16}
          className={loadingProcesses ? "animate-spin" : ""}
        />
        <span>刷新</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="系统监控"
        icon={Activity}
        onBack={onBack}
        actions={renderHeaderActions()}
      />

      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Tab 切换 */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab("occupation")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === "occupation"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Network size={16} />
              端口占用
            </button>
            <button
              onClick={() => setActiveTab("scan")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === "scan"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Search size={16} />
              端口扫描
            </button>
            <button
              onClick={() => setActiveTab("process")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === "process"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <ListTree size={16} />
              进程管理
            </button>
          </div>

          {activeTab === "occupation" && (
            <SystemMonitorOccupation
              occupations={occupations}
              loading={loadingOccupation}
              codeshelfPorts={codeshelfPorts}
              onKillRequest={(pid, name) =>
                setKillTarget({ pid, name, source: "occupation" })
              }
            />
          )}

          {activeTab === "scan" && (
            <SystemMonitorScan
              scanning={scanning}
              scanResults={scanResults}
              commonPorts={commonPorts}
              onScan={handleScan}
              onStop={handleStop}
            />
          )}

          {activeTab === "process" && (
            <SystemMonitorProcess
              processes={processes}
              systemStats={systemStats}
              loading={loadingProcesses}
              onFilterByPort={handleFilterByPort}
              onKillRequest={(pid, name) =>
                setKillTarget({ pid, name, source: "process" })
              }
            />
          )}
        </div>
      </div>

      {killTarget && (
        <SystemMonitorKillConfirm
          pid={killTarget.pid}
          name={killTarget.name}
          onCancel={() => setKillTarget(null)}
          onKill={handleKill}
        />
      )}
    </div>
  );
}
