import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import type { DeleteConfirmState } from "./types";

interface DeleteConfirmDialogProps {
  confirm: DeleteConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({ confirm, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">确认删除</h3>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          确定要删除{confirm.type === "server" ? "服务" : "转发规则"}{" "}
          <span className="font-medium text-gray-900 dark:text-white">"{confirm.name}"</span> 吗？
          此操作无法撤销。
        </p>
        <div className="flex justify-end gap-3">
          <Button onClick={onCancel} variant="secondary">
            取消
          </Button>
          <Button onClick={onConfirm} variant="primary" className="!bg-red-500 hover:!bg-red-600">
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}
