// 全局记忆编辑器（MEMORY.md）

import { Brain } from "lucide-react";
import { showToast } from "@/components/ui";
import { saveGlobalMemory } from "@/services/chat";

interface MemoryEditorDialogProps {
  open: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onClose: () => void;
  onSaved: (saved: string) => void;
}

export function MemoryEditorDialog({
  open,
  draft,
  onDraftChange,
  onClose,
  onSaved,
}: MemoryEditorDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[600px] max-w-[90vw] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Brain size={14} /> 全局记忆（MEMORY.md）
          </div>
          <span className="text-[11px] text-gray-400">每次对话将作为 system 消息最前置</span>
        </div>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-2 text-sm font-mono"
          rows={14}
          placeholder="例：我是 Go + React 背景，偏好简洁；代码用 2 空格缩进…"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
            onClick={async () => {
              try {
                await saveGlobalMemory(draft);
                onSaved(draft);
                showToast("success", "已保存");
              } catch {
                showToast("error", "保存失败");
              }
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
