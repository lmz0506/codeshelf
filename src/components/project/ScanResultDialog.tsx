import { useState } from "react";
import { X, FolderGit2, Check } from "lucide-react";
import { Button } from "@/components/ui";
import type { GitRepo } from "@/types";

interface ScanResultDialogProps {
  repos: GitRepo[];
  onConfirm: (selectedPaths: string[]) => void;
  onCancel: () => void;
}

export function ScanResultDialog({ repos, onConfirm, onCancel }: ScanResultDialogProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set(repos.map(r => r.path)));

  function toggleSelection(path: string) {
    const newSelected = new Set(selectedPaths);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedPaths(newSelected);
  }

  function selectAll() {
    setSelectedPaths(new Set(repos.map(r => r.path)));
  }

  function deselectAll() {
    setSelectedPaths(new Set());
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              扫描结果
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              找到 {repos.length} 个 Git 仓库，已选择 {selectedPaths.size} 个
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)]">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            全选
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll}>
            取消全选
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="space-y-2">
            {repos.map((repo) => {
              const isSelected = selectedPaths.has(repo.path);
              return (
                <button
                  key={repo.path}
                  onClick={() => toggleSelection(repo.path)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                      : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-tertiary)]"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-blue-500 border-blue-500"
                        : "border-[var(--color-border)]"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <FolderGit2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--color-text-primary)] truncate">
                      {repo.name}
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)] truncate">
                      {repo.path}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-[var(--color-border)]">
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selectedPaths))}
            disabled={selectedPaths.size === 0}
          >
            添加 {selectedPaths.size} 个项目
          </Button>
        </div>
      </div>
    </div>
  );
}
