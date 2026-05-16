// 聊天页 header 中的"会话工具"下拉菜单

import { Brain, ListChecks, Settings } from "lucide-react";
import { showToast } from "@/components/ui";
import type { ChatSession, Project, ToolSchema } from "@/types";

interface SessionMenuProps {
  open: boolean;
  onClose: () => void;
  // 工具
  toolsEnabled: boolean;
  onToolsEnabledChange: (v: boolean) => void;
  toolSchemas: ToolSchema[];
  // 会话
  activeSession: ChatSession;
  persistSession: (s: ChatSession) => Promise<ChatSession>;
  streaming: boolean;
  loading: boolean;
  // 目录
  projects: Project[];
  onPickCustomCwd: () => Promise<void>;
  // 操作回调
  onOpenMemory: () => void;
  onOpenSkills: () => void;
  onToggleTaskPanel: () => void;
  onCompact: () => void;
  onOpenConfig: () => void;
}

export function SessionMenu({
  open,
  onClose,
  toolsEnabled,
  onToolsEnabledChange,
  toolSchemas,
  activeSession,
  persistSession,
  streaming,
  loading,
  projects,
  onPickCustomCwd,
  onOpenMemory,
  onOpenSkills,
  onToggleTaskPanel,
  onCompact,
  onOpenConfig,
}: SessionMenuProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3 space-y-3 text-xs">
        {/* 工具 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-gray-700">🛠 工具</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={toolsEnabled}
                onChange={(e) => onToolsEnabledChange(e.target.checked)}
                disabled={streaming}
              />
              <span className={toolsEnabled ? "text-blue-600" : "text-gray-500"}>
                {toolsEnabled ? "已启用" : "未启用"}
              </span>
            </label>
          </div>
          {toolsEnabled && (
            <div className="border border-gray-100 rounded p-2 max-h-[180px] overflow-y-auto space-y-1">
              {toolSchemas.map((t) => {
                const enabled = (activeSession.enabledTools ?? toolSchemas.map((x) => x.name)).includes(t.name);
                return (
                  <label key={t.name} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={enabled}
                      onChange={async (e) => {
                        const current = new Set(activeSession.enabledTools ?? toolSchemas.map((x) => x.name));
                        if (e.target.checked) current.add(t.name);
                        else current.delete(t.name);
                        await persistSession({ ...activeSession, enabledTools: Array.from(current) });
                      }}
                      disabled={streaming}
                    />
                    <div>
                      <div className="font-mono text-gray-800">{t.name}</div>
                      <div className="text-[10px] text-gray-500 leading-tight">{t.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* MCP gateway 工具 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-gray-700">🌐 MCP 接口工具</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={activeSession.useMcpGatewayTools !== false}
                onChange={async (e) => {
                  await persistSession({ ...activeSession, useMcpGatewayTools: e.target.checked });
                }}
                disabled={streaming}
              />
              <span className={activeSession.useMcpGatewayTools !== false ? "text-blue-600" : "text-gray-500"}>
                {activeSession.useMcpGatewayTools !== false ? "已启用" : "未启用"}
              </span>
            </label>
          </div>
          <div className="text-[10px] text-gray-500 leading-tight">
            启用后，本会话可调用 MCP gateway 暴露的接口工具（来自"接口"中已注册的端点）。需要在设置中先启动 MCP gateway。
          </div>
        </div>

        {/* 目录 */}
        <div>
          <div className="font-semibold text-gray-700 mb-1">📁 目录（选了才会把项目上下文注入 system）</div>
          <select
            className="w-full px-2 py-1 border border-gray-200 rounded"
            value={
              activeSession.allowedCwd && projects.find((p) => p.path === activeSession.allowedCwd)
                ? `project:${activeSession.allowedCwd}`
                : activeSession.allowedCwd ? "custom" : ""
            }
            onChange={async (e) => {
              const v = e.target.value;
              if (v === "") {
                await persistSession({ ...activeSession, allowedCwd: undefined });
                return;
              }
              if (v === "custom") { await onPickCustomCwd(); return; }
              if (v.startsWith("project:")) {
                const path = v.slice("project:".length);
                await persistSession({ ...activeSession, allowedCwd: path });
                showToast("success", "已绑定项目目录");
              }
            }}
            disabled={streaming}
          >
            <option value="">未选（普通对话）</option>
            {projects.length > 0 && (
              <optgroup label="📚 书架项目">
                {projects.map((p) => (<option key={p.id} value={`project:${p.path}`}>{p.name}</option>))}
              </optgroup>
            )}
            <option value="custom">自定义目录…</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 flex items-center justify-center gap-1"
            onClick={() => { onClose(); onOpenMemory(); }}
          >
            <Brain size={12} /> 记忆
          </button>
          <button
            className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
            onClick={() => { onClose(); onOpenSkills(); }}
          >
            📚 Skills
          </button>
          <button
            className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 flex items-center justify-center gap-1"
            onClick={() => { onClose(); onToggleTaskPanel(); }}
            title="LLM 可通过 TaskCreate/Update/List 工具维护本会话的待办清单"
          >
            <ListChecks size={12} /> 任务
          </button>
          <button
            className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 flex items-center justify-center gap-1 disabled:opacity-50"
            disabled={streaming || loading || activeSession.messages.length < 6}
            onClick={() => { onClose(); onCompact(); }}
            title="将早期对话压缩为摘要，落盘为新版本 md；旧消息保留，发送时自动用最新摘要替换"
          >
            🗜 压缩{activeSession.currentCompactionVersion ? `（当前 ${activeSession.currentCompactionVersion}）` : ""}
          </button>
          <button
            className="col-span-2 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 flex items-center justify-center gap-1"
            onClick={() => { onClose(); onOpenConfig(); }}
          >
            <Settings size={12} /> 会话设置
          </button>
        </div>
      </div>
    </>
  );
}
