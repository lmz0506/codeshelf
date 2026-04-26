// 发送区域组件

import { useState } from "react";
import { Send, ChevronUp, Timer, Loader2 } from "lucide-react";
import AutoSendPanel from "./AutoSendPanel";
import type {
  NetcatSession,
  ConnectedClient,
  DataFormat,
  AutoSendConfig,
} from "@/types/toolbox";

interface SendAreaProps {
  session: NetcatSession;
  clients: ConnectedClient[];
  sendData: string;
  sendFormat: DataFormat;
  targetClient: string;
  broadcast: boolean;
  autoSend: AutoSendConfig;
  autoSendCount: number;
  showAutoSendPanel: boolean;
  onSendDataChange: (v: string) => void;
  onSendFormatChange: (v: DataFormat) => void;
  onTargetClientChange: (v: string) => void;
  onBroadcastChange: (v: boolean) => void;
  onSendMessage: () => void;
  onToggleAutoSend: (enable: boolean) => void;
  onUpdateAutoSendConfig: (updates: Partial<AutoSendConfig>) => void;
  onToggleAutoSendPanel: () => void;
}

export default function SendArea({
  session,
  clients,
  sendData,
  sendFormat,
  targetClient,
  broadcast,
  autoSend,
  autoSendCount,
  showAutoSendPanel,
  onSendDataChange,
  onSendFormatChange,
  onTargetClientChange,
  onBroadcastChange,
  onSendMessage,
  onToggleAutoSend,
  onUpdateAutoSendConfig,
  onToggleAutoSendPanel,
}: SendAreaProps) {
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const sessionConnected = session.status === "connected" || session.status === "listening";

  return (
    <div className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      {/* 自动发送配置面板 */}
      {showAutoSendPanel && (
        <AutoSendPanel
          config={autoSend}
          autoSendCount={autoSendCount}
          sessionConnected={sessionConnected}
          onClose={onToggleAutoSendPanel}
          onToggle={onToggleAutoSend}
          onUpdateConfig={onUpdateAutoSendConfig}
        />
      )}

      {/* 服务器模式客户端选择 */}
      {session.mode === "server" && clients.length > 0 && (
        <div className="flex items-center gap-3 mb-2">
          {/* 客户端选择下拉框 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => !broadcast && setShowClientDropdown(!showClientDropdown)}
              disabled={broadcast}
              className={`flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm min-w-[200px] justify-between ${
                broadcast ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <span className="truncate text-xs">
                {targetClient
                  ? clients.find((c) => c.id === targetClient)?.addr || "选择客户端"
                  : "选择客户端"}
              </span>
              <ChevronUp size={12} className={`shrink-0 transition-transform ${showClientDropdown ? "" : "rotate-180"}`} />
            </button>
            {showClientDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowClientDropdown(false)} />
                <div className="absolute bottom-full left-0 mb-1 w-full min-w-[200px] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-20 overflow-hidden max-h-40 overflow-y-auto">
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onTargetClientChange(c.id);
                        setShowClientDropdown(false);
                      }}
                      className={`w-full px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-600 ${
                        targetClient === c.id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600" : ""
                      }`}
                    >
                      <span>{c.addr}</span>
                      <span className="text-gray-400 ml-1">({new Date(c.connectedAt).toLocaleTimeString()})</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={broadcast}
              onChange={(e) => onBroadcastChange(e.target.checked)}
              className="rounded"
            />
            广播
          </label>
        </div>
      )}

      <div className="flex gap-2">
        {/* 格式下拉框 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFormatDropdown(!showFormatDropdown)}
            className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm min-w-[70px] justify-between"
          >
            <span className="text-xs">{sendFormat === "text" ? "文本" : sendFormat === "hex" ? "HEX" : "B64"}</span>
            <ChevronUp size={12} className={`transition-transform ${showFormatDropdown ? "" : "rotate-180"}`} />
          </button>
          {showFormatDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFormatDropdown(false)} />
              <div className="absolute bottom-full left-0 mb-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-20 overflow-hidden">
                {[
                  { value: "text" as DataFormat, label: "文本" },
                  { value: "hex" as DataFormat, label: "HEX" },
                  { value: "base64" as DataFormat, label: "Base64" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onSendFormatChange(opt.value);
                      setShowFormatDropdown(false);
                    }}
                    className={`w-full px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-600 ${
                      sendFormat === opt.value ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600" : ""
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <input
          type="text"
          className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
          value={sendData}
          onChange={(e) => onSendDataChange(e.target.value)}
          placeholder={
            sendFormat === "hex" ? "48 65 6C 6C 6F" : sendFormat === "base64" ? "Base64" : "输入内容..."
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSendMessage();
            }
          }}
        />
        <button
          onClick={onSendMessage}
          disabled={!sendData.trim() || !sessionConnected}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm font-medium rounded transition-colors disabled:cursor-not-allowed"
        >
          <Send size={14} />
          发送
        </button>
        <button
          onClick={onToggleAutoSendPanel}
          className={`flex items-center gap-1 px-2 py-1.5 border rounded text-sm transition-colors ${
            showAutoSendPanel || autoSend.enabled
              ? "bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-600"
              : "bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 hover:bg-gray-100"
          }`}
          title="自动发送"
        >
          {autoSend.enabled ? <Loader2 size={14} className="animate-spin" /> : <Timer size={14} />}
        </button>
      </div>
    </div>
  );
}
