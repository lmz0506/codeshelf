import { useState, useEffect } from "react";
import { X, GitBranch, Plus, Check, RefreshCw, AlertCircle } from "lucide-react";
import { showToast } from "@/components/ui";
import type { BranchInfo } from "@/types";
import { getBranches, checkoutBranch, createBranch, gitFetch } from "@/services/git";

interface BranchSwitchModalProps {
  projectPath: string;
  currentBranch: string;
  onClose: () => void;
  onBranchChange: () => void;
}

export function BranchSwitchModal({
  projectPath,
  currentBranch,
  onClose,
  onBranchChange,
}: BranchSwitchModalProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadBranches();
  }, [projectPath]);

  async function loadBranches() {
    try {
      setLoading(true);
      setError(null);
      const branchList = await getBranches(projectPath);
      setBranches(branchList);
    } catch (err) {
      setError("Failed to load branches: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFetch() {
    try {
      setLoading(true);
      setError(null);
      await gitFetch(projectPath);
      await loadBranches();
      showToast("success", "获取成功", "已获取远程分支信息");
    } catch (err) {
      setError("Failed to fetch: " + err);
      showToast("error", "获取失败", String(err));
      setLoading(false);
    }
  }

  async function handleCheckout(branch: string) {
    if (branch === currentBranch) return;

    try {
      setSwitching(true);
      setError(null);
      await checkoutBranch(projectPath, branch);
      showToast("success", "切换成功", `已切换到分支 ${branch}`);
      onBranchChange();
      onClose();
    } catch (err) {
      setError("Failed to switch branch: " + err);
      showToast("error", "切换失败", String(err));
    } finally {
      setSwitching(false);
    }
  }

  async function handleCreateBranch() {
    if (!newBranchName.trim()) return;

    try {
      setSwitching(true);
      setError(null);
      await createBranch(projectPath, newBranchName.trim(), true);
      showToast("success", "创建成功", `已创建并切换到分支 ${newBranchName.trim()}`);
      onBranchChange();
      onClose();
    } catch (err) {
      setError("Failed to create branch: " + err);
      showToast("error", "创建失败", String(err));
    } finally {
      setSwitching(false);
    }
  }

  // Filter branches
  const localBranches = branches.filter(b => !b.isRemote);
  const remoteBranches = branches.filter(b => b.isRemote);

  const filteredLocalBranches = localBranches.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredRemoteBranches = remoteBranches.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="modal-content animate-scale-in max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="modal-title">切换分支</h3>
              <p className="modal-subtitle">当前: {currentBranch}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 text-red-600 rounded-lg text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Actions Bar */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="搜索分支..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleFetch}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="获取远程分支"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="创建新分支"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Create Branch Form */}
          {showCreateForm && (
            <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                新分支名称
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/my-new-feature"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateBranch();
                    }
                  }}
                />
                <button
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim() || switching}
                  className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  创建
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                将基于当前分支 ({currentBranch}) 创建并切换到新分支
              </p>
            </div>
          )}

          {/* Branch List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {/* Local Branches */}
              {filteredLocalBranches.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    本地分支 ({filteredLocalBranches.length})
                  </h4>
                  <div className="space-y-1">
                    {filteredLocalBranches.map((branch) => (
                      <button
                        key={branch.name}
                        onClick={() => handleCheckout(branch.name)}
                        disabled={switching || branch.name === currentBranch}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          branch.name === currentBranch
                            ? "bg-blue-50 text-blue-700 cursor-default"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <GitBranch
                          size={16}
                          className={branch.name === currentBranch ? "text-blue-500" : "text-gray-400"}
                        />
                        <span className="flex-1 font-medium text-sm truncate">
                          {branch.name}
                        </span>
                        {branch.name === currentBranch && (
                          <Check size={16} className="text-blue-500" />
                        )}
                        {branch.upstream && (
                          <span className="text-xs text-gray-400 truncate max-w-[120px]">
                            {branch.upstream}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Remote Branches */}
              {filteredRemoteBranches.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    远程分支 ({filteredRemoteBranches.length})
                  </h4>
                  <div className="space-y-1">
                    {filteredRemoteBranches.map((branch) => {
                      // Extract branch name without remote prefix
                      const branchName = branch.name.includes("/")
                        ? branch.name.split("/").slice(1).join("/")
                        : branch.name;

                      return (
                        <button
                          key={branch.name}
                          onClick={() => handleCheckout(branchName)}
                          disabled={switching}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 text-gray-600 transition-all"
                        >
                          <GitBranch size={16} className="text-gray-400" />
                          <span className="flex-1 font-medium text-sm truncate">
                            {branch.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {filteredLocalBranches.length === 0 && filteredRemoteBranches.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <GitBranch size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">没有找到匹配的分支</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="modal-btn modal-btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
