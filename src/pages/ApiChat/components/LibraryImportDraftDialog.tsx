// 接口库导入草稿弹窗。
// 用户从备份/文档 import 后会先看到这里，选择要导入哪些分组/接口、以及冲突策略。
// 状态由 parent 持有（importDraft），这里只负责渲染和把事件回调上去。

import { X } from "lucide-react";
import type { ApiEndpoint, ApiGroup } from "@/types";

type ImportStrategy = "overwrite" | "ignore";

export interface ImportDraft {
  title: string;
  groups: ApiGroup[];
  endpoints: ApiEndpoint[];
  selectedGroupIds: Set<string>;
  selectedEndpointIds: Set<string>;
  strategy: ImportStrategy;
}

interface Props {
  draft: ImportDraft;
  loading: boolean;
  selectedCount: { groups: number; endpoints: number };
  findGroupConflict: (g: ApiGroup) => ApiGroup | undefined;
  findEndpointConflict: (ep: ApiEndpoint) => ApiEndpoint | undefined;
  onClose: () => void;
  onStrategyChange: (strategy: ImportStrategy) => void;
  onToggleGroup: (groupId: string) => void;
  onToggleEndpoint: (endpointId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApply: () => void;
}

export function LibraryImportDraftDialog({
  draft,
  loading,
  selectedCount,
  findGroupConflict,
  findEndpointConflict,
  onClose,
  onStrategyChange,
  onToggleGroup,
  onToggleEndpoint,
  onSelectAll,
  onClearSelection,
  onApply,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-[820px] max-w-[94vw] h-[640px] max-h-[88vh] rounded-lg bg-white shadow-xl border border-gray-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <div className="text-sm font-semibold text-gray-800">确认导入：{draft.title}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              已选择 {selectedCount.groups} 个分组 / {selectedCount.endpoints} 个接口
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-gray-700">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={draft.strategy === "overwrite"}
                onChange={() => onStrategyChange("overwrite")}
              />
              <span>覆盖已有</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={draft.strategy === "ignore"}
                onChange={() => onStrategyChange("ignore")}
              />
              <span>忽略已有</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs text-blue-500 hover:underline" onClick={onSelectAll}>
              全选
            </button>
            <button className="text-xs text-gray-500 hover:underline" onClick={onClearSelection}>
              清空
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-[260px_1fr] min-h-0">
          <div className="border-r border-gray-200 min-h-0 flex flex-col">
            <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-b border-gray-100">分组</div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {draft.groups.map((g) => {
                const conflict = findGroupConflict(g);
                const selected = draft.selectedGroupIds.has(g.id);
                const endpointCount = draft.endpoints.filter((ep) => ep.groupId === g.id).length;
                return (
                  <label
                    key={g.id}
                    className={`block rounded border px-2 py-2 text-xs cursor-pointer ${
                      selected ? "border-blue-200 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleGroup(g.id)}
                      />
                      <span className="flex-1 truncate font-medium text-gray-800" title={g.name}>{g.name}</span>
                      <span className="text-[10px] text-gray-400">{endpointCount}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-5">
                      {conflict ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">已有</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">新增</span>
                      )}
                      <span className="truncate text-[10px] text-gray-400" title={g.baseUrl}>{g.baseUrl || "未设置 Base URL"}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex flex-col">
            <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-b border-gray-100">接口</div>
            <div className="flex-1 overflow-auto">
              {draft.endpoints.map((ep) => {
                const conflict = findEndpointConflict(ep);
                const selected = draft.selectedEndpointIds.has(ep.id);
                const groupName = draft.groups.find((g) => g.id === ep.groupId)?.name ?? "独立接口";
                return (
                  <label
                    key={ep.id}
                    className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-gray-100 cursor-pointer ${
                      selected ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleEndpoint(ep.id)}
                    />
                    <span
                      className={`font-mono px-1.5 py-0.5 rounded text-[10px] ${
                        ep.method === "GET"
                          ? "bg-green-100 text-green-700"
                          : ep.method === "DELETE"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-gray-800" title={ep.name}>{ep.name}</div>
                      <div className="truncate text-gray-400 font-mono text-[10px]" title={ep.url}>{ep.url}</div>
                    </div>
                    <span className="max-w-[120px] truncate text-[10px] text-gray-400" title={groupName}>{groupName}</span>
                    {conflict ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">已有</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">新增</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg disabled:opacity-60"
            onClick={onApply}
            disabled={loading || selectedCount.groups + selectedCount.endpoints === 0}
          >
            {loading ? "导入中..." : "导入所选"}
          </button>
        </div>
      </div>
    </div>
  );
}
