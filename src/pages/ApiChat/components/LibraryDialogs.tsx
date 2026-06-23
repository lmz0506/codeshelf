// 接口库的三个辅助弹窗：删除确认、文档导入入口选择、文档 URL 输入。
// 都是简单的小弹窗，只读 props 不持有状态。

import { FileUp, Link, X } from "lucide-react";
import type { ApiEndpoint, ApiGroup } from "@/types";

export type PendingDelete =
  | { kind: "group"; data: ApiGroup }
  | { kind: "endpoint"; data: ApiEndpoint }
  | { kind: "endpoints"; data: ApiEndpoint[] };

interface DeleteProps {
  pendingDelete: PendingDelete;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LibraryDeleteConfirmDialog({
  pendingDelete,
  loading,
  onCancel,
  onConfirm,
}: DeleteProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="w-[380px] max-w-[90vw] rounded-lg bg-white shadow-xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-900">
            {pendingDelete.kind === "group"
              ? "删除分组"
              : pendingDelete.kind === "endpoint"
                ? "删除接口"
                : "批量删除接口"}
          </div>
        </div>
        <div className="p-4 text-sm text-gray-700">
          {pendingDelete.kind === "group" ? (
            <>
              <div>确定删除分组「{pendingDelete.data.name}」？</div>
              <div className="mt-2 text-xs text-gray-500">组内接口不会删除，会变为独立接口。</div>
            </>
          ) : pendingDelete.kind === "endpoint" ? (
            <div>确定删除接口「{pendingDelete.data.name}」？</div>
          ) : (
            <>
              <div>确定删除选中的 {pendingDelete.data.length} 个接口？</div>
              <div className="mt-2 max-h-32 overflow-auto rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-500">
                {pendingDelete.data.map((ep) => (
                  <div key={ep.id} className="truncate" title={ep.name}>{ep.name}</div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg disabled:opacity-60"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "删除中..." : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChoiceProps {
  onClose: () => void;
  onPickLocal: () => void;
  onPickUrl: () => void;
}

export function LibraryDocumentImportChoice({ onClose, onPickLocal, onPickUrl }: ChoiceProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-[360px] max-w-[90vw] rounded-lg bg-white shadow-xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-800">选择导入方式</div>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-4 grid gap-2">
          <button
            className="w-full text-left px-3 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center gap-3"
            onClick={onPickLocal}
          >
            <FileUp size={18} className="text-blue-500" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">本地文件</div>
              <div className="text-xs text-gray-500">选择 JSON / YAML 接口文档</div>
            </div>
          </button>
          <button
            className="w-full text-left px-3 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center gap-3"
            onClick={onPickUrl}
          >
            <Link size={18} className="text-blue-500" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">在线链接</div>
              <div className="text-xs text-gray-500">输入 RAW JSON / YAML 文档地址</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

interface UrlProps {
  value: string;
  loading: boolean;
  onChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function LibraryDocumentImportUrl({
  value,
  loading,
  onChange,
  onClose,
  onSubmit,
}: UrlProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-[460px] max-w-[92vw] rounded-lg bg-white shadow-xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-800">导入在线接口文档</div>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-blue-400"
            placeholder="https://example.com/openapi.json"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) onSubmit();
            }}
          />
          <div className="text-xs text-gray-500">请输入可直接访问的 RAW JSON / YAML 文档地址。</div>
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
            onClick={onSubmit}
            disabled={loading || !value.trim()}
          >
            {loading ? "导入中..." : "导入"}
          </button>
        </div>
      </div>
    </div>
  );
}
