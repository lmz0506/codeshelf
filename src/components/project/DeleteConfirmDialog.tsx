import { useState } from "react";
import { AlertTriangle, Trash2, FolderMinus } from "lucide-react";

interface DeleteConfirmDialogProps {
  projectName: string;
  onConfirm: (deleteDirectory: boolean) => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  projectName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const [deleteDirectory, setDeleteDirectory] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--text)]">
              确认删除项目
            </h3>
          </div>
          <p className="text-sm text-[var(--text-light)] mt-3">
            确定要删除项目 <span className="font-semibold text-[var(--text)]">"{projectName}"</span> 吗？
          </p>
        </div>

        {/* Options */}
        <div className="px-8 py-6 space-y-3">
          {/* Option 1: Remove from list only */}
          <button
            onClick={() => setDeleteDirectory(false)}
            className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
              !deleteDirectory
                ? "border-[var(--primary)] bg-[var(--primary-light)]"
                : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--bg-light)]"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                !deleteDirectory ? "bg-[var(--primary)]/10" : "bg-[var(--bg-light)]"
              }`}>
                <FolderMinus className={`w-5 h-5 ${
                  !deleteDirectory ? "text-[var(--primary)]" : "text-[var(--text-light)]"
                }`} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-[var(--text)] mb-1">
                  仅移除项目
                </div>
                <div className="text-sm text-[var(--text-light)]">
                  从管理列表中移除，不删除实际文件
                </div>
              </div>
              <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                !deleteDirectory
                  ? "border-[var(--primary)] bg-[var(--primary)]"
                  : "border-[var(--border)]"
              }`}>
                {!deleteDirectory && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </div>
          </button>

          {/* Option 2: Delete directory */}
          <button
            onClick={() => setDeleteDirectory(true)}
            className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
              deleteDirectory
                ? "border-red-500 bg-red-500/5"
                : "border-[var(--border)] hover:border-red-500/50 hover:bg-[var(--bg-light)]"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                deleteDirectory ? "bg-red-500/10" : "bg-[var(--bg-light)]"
              }`}>
                <Trash2 className={`w-5 h-5 ${
                  deleteDirectory ? "text-red-600 dark:text-red-400" : "text-[var(--text-light)]"
                }`} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-[var(--text)] mb-1">
                  删除项目和文件
                </div>
                <div className={`text-sm ${
                  deleteDirectory ? "text-red-600 dark:text-red-400 font-medium" : "text-[var(--text-light)]"
                }`}>
                  {deleteDirectory ? (
                    <>⚠️ 将永久删除项目文件夹及所有内容，不可恢复！</>
                  ) : (
                    <>永久删除项目目录及其所有内容</>
                  )}
                </div>
              </div>
              <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                deleteDirectory
                  ? "border-red-500 bg-red-500"
                  : "border-[var(--border)]"
              }`}>
                {deleteDirectory && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 py-6 border-t border-[var(--border)] bg-[var(--bg-light)]">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--card)] transition-colors font-medium"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(deleteDirectory)}
            className={`px-5 py-2.5 rounded-lg text-white transition-colors font-medium ${
              deleteDirectory
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--primary)] hover:bg-[var(--primary)]/90"
            }`}
          >
            {deleteDirectory ? "确认删除" : "确认移除"}
          </button>
        </div>
      </div>
    </div>
  );
}
