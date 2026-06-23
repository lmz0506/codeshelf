// 创建会话表单组件

import { X } from "lucide-react";
import type { Protocol, SessionMode } from "@/types/toolbox";

interface CreateSessionFormProps {
  newProtocol: Protocol;
  newMode: SessionMode;
  newHost: string;
  newPort: string;
  newName: string;
  loading: string | null;
  onProtocolChange: (v: Protocol) => void;
  onModeChange: (v: SessionMode) => void;
  onHostChange: (v: string) => void;
  onPortChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function CreateSessionForm({
  newProtocol,
  newMode,
  newHost,
  newPort,
  newName,
  loading,
  onProtocolChange,
  onModeChange,
  onHostChange,
  onPortChange,
  onNameChange,
  onSubmit,
  onCancel,
}: CreateSessionFormProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">新建会话</h3>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              会话名称
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="可选，留空自动生成"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                协议
              </label>
              <select
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={newProtocol}
                onChange={(e) => onProtocolChange(e.target.value as Protocol)}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                模式
              </label>
              <select
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={newMode}
                onChange={(e) => onModeChange(e.target.value as SessionMode)}
              >
                <option value="client">客户端</option>
                <option value="server">服务器</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {newMode === "server" ? "绑定地址" : "目标地址"}
              </label>
              <input
                type="text"
                value={newHost}
                onChange={(e) => onHostChange(e.target.value)}
                placeholder="127.0.0.1"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                端口
              </label>
              <input
                type="number"
                value={newPort}
                onChange={(e) => onPortChange(e.target.value)}
                placeholder="8080"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onSubmit}
              disabled={loading === "create"}
              className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              创建会话
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
