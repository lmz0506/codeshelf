import { useState } from "react";
import { X, FolderGit2, Check, CheckCircle2 } from "lucide-react";
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--border)]">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text)] mb-1">
              发现 Git 项目
            </h2>
            <p className="text-sm text-[var(--text-light)]">
              找到 <span className="font-semibold text-[var(--primary)]">{repos.length}</span> 个仓库，
              已选择 <span className="font-semibold text-[var(--primary)]">{selectedPaths.size}</span> 个
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--bg-light)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-8 py-4 bg-[var(--bg-light)]">
          <button
            onClick={selectAll}
            className="text-sm text-[var(--primary)] hover:underline font-medium"
          >
            全选
          </button>
          <span className="text-[var(--text-light)]">·</span>
          <button
            onClick={deselectAll}
            className="text-sm text-[var(--text-light)] hover:text-[var(--text)] hover:underline"
          >
            取消全选
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="space-y-3">
            {repos.map((repo) => {
              const isSelected = selectedPaths.has(repo.path);
              return (
                <button
                  key={repo.path}
                  onClick={() => toggleSelection(repo.path)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl transition-all text-left group ${
                    isSelected
                      ? "bg-[var(--primary-light)] border-2 border-[var(--primary)]"
                      : "bg-[var(--bg-light)] border-2 border-transparent hover:border-[var(--border)] hover:shadow-sm"
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-[var(--primary)] border-[var(--primary)]"
                        : "border-[var(--border)] group-hover:border-[var(--primary)]"
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </div>

                  {/* Icon */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    isSelected ? "bg-[var(--primary)]/10" : "bg-[var(--card)]"
                  }`}>
                    <FolderGit2 className={`w-5 h-5 ${isSelected ? "text-[var(--primary)]" : "text-[var(--text-light)]"}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text)] mb-0.5 truncate">
                      {repo.name}
                    </p>
                    <p className="text-sm text-[var(--text-light)] truncate">
                      {repo.path}
                    </p>
                  </div>

                  {/* Selected Badge */}
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-6 border-t border-[var(--border)] bg-[var(--bg-light)]">
          <p className="text-sm text-[var(--text-light)]">
            {selectedPaths.size === 0 ? "请至少选择一个项目" : `将添加 ${selectedPaths.size} 个项目到书架`}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onCancel}>
              取消
            </Button>
            <Button
              onClick={() => onConfirm(Array.from(selectedPaths))}
              disabled={selectedPaths.size === 0}
            >
              确认添加
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
