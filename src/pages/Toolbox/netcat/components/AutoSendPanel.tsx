// 自动发送配置面板组件

import { Settings2, ChevronDown, Play, Pause } from "lucide-react";
import type { AutoSendConfig, AutoSendMode } from "@/types/toolbox";

interface AutoSendPanelProps {
  config: AutoSendConfig;
  autoSendCount: number;
  sessionConnected: boolean;
  onClose: () => void;
  onToggle: (enable: boolean) => void;
  onUpdateConfig: (updates: Partial<AutoSendConfig>) => void;
}

export default function AutoSendPanel({
  config,
  autoSendCount,
  sessionConnected,
  onClose,
  onToggle,
  onUpdateConfig,
}: AutoSendPanelProps) {
  return (
    <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
          <Settings2 size={14} />
          自动发送
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            已发送: <span className="font-medium">{autoSendCount}</span>
          </span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            <ChevronDown size={14} className="text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">模式</label>
          <select
            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
            value={config.mode}
            onChange={(e) => onUpdateConfig({ mode: e.target.value as AutoSendMode })}
            disabled={config.enabled}
          >
            <option value="fixed">固定内容</option>
            <option value="csv">CSV/多行</option>
            <option value="template">模板生成</option>
            <option value="http">HTTP 获取</option>
          </select>
        </div>
        <div className="w-28">
          <label className="block text-xs text-gray-500 mb-1">间隔 (ms)</label>
          <input
            type="number"
            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
            value={config.intervalMs}
            onChange={(e) => onUpdateConfig({ intervalMs: Math.max(100, parseInt(e.target.value) || 1000) })}
            disabled={config.enabled}
            min={100}
            step={100}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => onToggle(!config.enabled)}
            disabled={!sessionConnected}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded transition-colors ${
              config.enabled
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-green-500 hover:bg-green-600 text-white"
            } disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed`}
          >
            {config.enabled ? <><Pause size={12} /> 停止</> : <><Play size={12} /> 启动</>}
          </button>
        </div>
      </div>

      {/* 模式特定配置 */}
      <div className="text-xs">
        {config.mode === "fixed" && (
          <textarea
            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono h-16 resize-none"
            value={config.fixedData}
            onChange={(e) => onUpdateConfig({ fixedData: e.target.value })}
            placeholder="输入固定发送内容..."
            disabled={config.enabled}
          />
        )}
        {config.mode === "csv" && (
          <textarea
            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono h-16 resize-none"
            value={config.csvData}
            onChange={(e) => onUpdateConfig({ csvData: e.target.value })}
            placeholder="每行一条数据，循环发送"
            disabled={config.enabled}
          />
        )}
        {config.mode === "template" && (
          <div>
            <div className="text-gray-400 mb-1">
              变量: {`{{random:1-100}}`} {`{{uuid}}`} {`{{timestamp}}`} {`{{float:0-1}}`} {`{{choice:a,b,c}}`}
            </div>
            <textarea
              className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono h-16 resize-none"
              value={config.template}
              onChange={(e) => onUpdateConfig({ template: e.target.value })}
              placeholder={'{"id":"{{uuid}}","value":{{random:1-100}}}'}
              disabled={config.enabled}
            />
          </div>
        )}
        {config.mode === "http" && (
          <div className="space-y-1">
            <div className="flex gap-2">
              <select
                className="w-20 px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
                value={config.httpMethod || "GET"}
                onChange={(e) => onUpdateConfig({ httpMethod: e.target.value })}
                disabled={config.enabled}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="text"
                className="flex-1 px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
                value={config.httpUrl}
                onChange={(e) => onUpdateConfig({ httpUrl: e.target.value })}
                placeholder="HTTP URL"
                disabled={config.enabled}
              />
            </div>
            <input
              type="text"
              className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
              value={config.httpHeaders || ""}
              onChange={(e) => onUpdateConfig({ httpHeaders: e.target.value })}
              placeholder='Headers (JSON): {"Authorization": "Bearer xxx"}'
              disabled={config.enabled}
            />
            {(config.httpMethod === "POST" || config.httpMethod === "PUT") && (
              <input
                type="text"
                className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
                value={config.httpBody || ""}
                onChange={(e) => onUpdateConfig({ httpBody: e.target.value })}
                placeholder="Request Body"
                disabled={config.enabled}
              />
            )}
            <input
              type="text"
              className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
              value={config.httpJsonPath || ""}
              onChange={(e) => onUpdateConfig({ httpJsonPath: e.target.value })}
              placeholder="JSON 路径 (如: data.items[0].value 或 data.name,data.id)"
              disabled={config.enabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
