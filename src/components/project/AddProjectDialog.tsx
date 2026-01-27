import { useState } from "react";
import { X, Folder, GitBranch, Plus, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { CategorySelector } from "./CategorySelector";
import { addProject } from "@/services/db";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "@/types";

interface AddProjectDialogProps {
  onConfirm: (project: Project) => void;
  onCancel: () => void;
}

export function AddProjectDialog({ onConfirm, onCancel }: AddProjectDialogProps) {
  const [mode, setMode] = useState<"local" | "git">("local");
  const [localPath, setLocalPath] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [gitTargetPath, setGitTargetPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSelectLocalPath() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });

      if (selected) {
        const path = selected as string;
        setLocalPath(path);
        if (!projectName) {
          const name = path.split(/[\\/]/).pop() || "";
          setProjectName(name);
        }
        setError("");
      }
    } catch (err) {
      setError("选择文件夹失败");
    }
  }

  async function handleSelectGitTargetPath() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择克隆目标目录",
      });

      if (selected) {
        setGitTargetPath(selected as string);
        setError("");
      }
    } catch (err) {
      setError("选择目录失败");
    }
  }

  async function handleConfirm() {
    try {
      setLoading(true);
      setError("");

      if (mode === "local") {
        // Add local project
        if (!localPath) {
          setError("请选择项目文件夹");
          return;
        }

        const name = projectName.trim() || localPath.split(/[\\/]/).pop() || "Unknown";
        const project = await addProject({
          name,
          path: localPath,
          tags: selectedCategories,
        });

        onConfirm(project);
      } else {
        // Clone git repository
        if (!gitUrl.trim()) {
          setError("请输入 Git 仓库地址");
          return;
        }
        if (!gitTargetPath) {
          setError("请选择克隆目标目录");
          return;
        }

        // Extract repo name from URL if not provided
        let name = projectName.trim();
        if (!name) {
          const match = gitUrl.match(/\/([^\/]+?)(\.git)?$/);
          name = match ? match[1] : "Unknown";
        }

        // Clone repository
        const clonePath = await invoke<string>("git_clone", {
          url: gitUrl.trim(),
          targetDir: gitTargetPath,
          repoName: name,
        });

        // Add cloned project
        const project = await addProject({
          name,
          path: clonePath,
          tags: selectedCategories,
        });

        onConfirm(project);
      }
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--text)]">
              添加项目
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--bg-light)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="px-8 py-6 border-b border-[var(--border)] bg-[var(--bg-light)]">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("local")}
              className={`flex items-center gap-3 px-5 py-4 rounded-xl border-2 transition-all ${
                mode === "local"
                  ? "border-[var(--primary)] bg-[var(--primary-light)]"
                  : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--card)]"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                mode === "local" ? "bg-[var(--primary)]/10" : "bg-[var(--bg-light)]"
              }`}>
                <Folder className={`w-5 h-5 ${
                  mode === "local" ? "text-[var(--primary)]" : "text-[var(--text-light)]"
                }`} />
              </div>
              <div className="text-left">
                <div className={`font-semibold ${
                  mode === "local" ? "text-[var(--primary)]" : "text-[var(--text)]"
                }`}>
                  本地目录
                </div>
                <div className="text-xs text-[var(--text-light)]">
                  添加已存在的项目
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode("git")}
              className={`flex items-center gap-3 px-5 py-4 rounded-xl border-2 transition-all ${
                mode === "git"
                  ? "border-[var(--primary)] bg-[var(--primary-light)]"
                  : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--card)]"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                mode === "git" ? "bg-[var(--primary)]/10" : "bg-[var(--bg-light)]"
              }`}>
                <GitBranch className={`w-5 h-5 ${
                  mode === "git" ? "text-[var(--primary)]" : "text-[var(--text-light)]"
                }`} />
              </div>
              <div className="text-left">
                <div className={`font-semibold ${
                  mode === "git" ? "text-[var(--primary)]" : "text-[var(--text)]"
                }`}>
                  Git 克隆
                </div>
                <div className="text-xs text-[var(--text-light)]">
                  从远程仓库克隆
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-8 py-6 space-y-5">
          {mode === "local" ? (
            <>
              {/* Local Path */}
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-2">
                  项目路径 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localPath}
                    readOnly
                    placeholder="点击选择项目文件夹..."
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-light)] cursor-pointer"
                    onClick={handleSelectLocalPath}
                  />
                  <button
                    onClick={handleSelectLocalPath}
                    className="px-4 py-2.5 border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--bg-light)] transition-colors font-medium"
                  >
                    浏览
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Git URL */}
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-2">
                  Git 仓库地址 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={gitUrl}
                  onChange={(e) => {
                    setGitUrl(e.target.value);
                    setError("");
                  }}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-4 py-2.5 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent font-mono text-sm"
                />
              </div>

              {/* Target Directory */}
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-2">
                  克隆到 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={gitTargetPath}
                    readOnly
                    placeholder="选择克隆目标目录..."
                    className="flex-1 px-4 py-2.5 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-light)] cursor-pointer"
                    onClick={handleSelectGitTargetPath}
                  />
                  <button
                    onClick={handleSelectGitTargetPath}
                    className="px-4 py-2.5 border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--bg-light)] transition-colors font-medium"
                  >
                    浏览
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">
              项目名称
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="留空则自动从路径提取"
              className="w-full px-4 py-2.5 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            />
          </div>

          {/* Categories */}
          <CategorySelector
            selectedCategories={selectedCategories}
            onChange={setSelectedCategories}
            multiple={true}
          />

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 py-6 border-t border-[var(--border)] bg-[var(--bg-light)]">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-5 py-2.5 border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--card)] transition-colors font-medium disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? (mode === "git" ? "克隆中..." : "添加中...") : "确认添加"}
          </button>
        </div>
      </div>
    </div>
  );
}
