import { Check, Database, GitBranch, Plus, Trash2 } from "lucide-react";
import type { GitStatus, RemoteInfo } from "@/types";
import { getRemoteType } from "./gitUtils";

interface GitSidebarProps {
  gitStatus: GitStatus | null;
  remotes: RemoteInfo[];
  currentRemote: string | null;
  onOpenBranchModal: () => void;
  onAddRemote: () => void;
  onOpenSyncModal: () => void;
  onSelectRemote: (remoteName: string) => void;
  onRemoveRemote: (remoteName: string) => void;
}

export function GitSidebar({
  gitStatus,
  remotes,
  currentRemote,
  onOpenBranchModal,
  onAddRemote,
  onOpenSyncModal,
  onSelectRemote,
  onRemoveRemote,
}: GitSidebarProps) {
  const changeCount = (gitStatus?.staged.length || 0) + (gitStatus?.unstaged.length || 0) + (gitStatus?.untracked.length || 0);
  const branchState = gitStatus?.ahead || gitStatus?.behind
    ? `领先 ${gitStatus.ahead} / 落后 ${gitStatus.behind}`
    : gitStatus?.isClean
      ? "已同步"
      : `${changeCount} 个修改`;

  return (
    <div className="sidebar-scroll-area">
      <div className="sidebar-section">
        <div className="section-header">
          <span className="section-title">当前分支</span>
          <span className={`status-badge ${gitStatus?.isClean ? "status-badge-success" : "status-badge-warning"}`}>
            {gitStatus?.isClean ? "干净" : "有修改"}
          </span>
        </div>

        <div className="branch-card">
          <div className="flex items-center gap-sm mb-xs">
            <GitBranch size={16} className="text-blue-600" />
            <span className="branch-name">{gitStatus?.branch || "master"}</span>
          </div>
          <div className="branch-meta">
            <div className={`branch-indicator ${gitStatus?.isClean ? "" : "branch-indicator-warning"}`}></div>
            <span className="branch-changes">{branchState}</span>
          </div>
          {gitStatus && !gitStatus.isClean && (
            <div className="git-worktree-summary">
              <span>暂存 {gitStatus.staged.length}</span>
              <span>修改 {gitStatus.unstaged.length}</span>
              <span>新增 {gitStatus.untracked.length}</span>
            </div>
          )}
        </div>

        <button onClick={onOpenBranchModal} className="branch-switch-btn">
          <Plus size={13} />
          <span>切换或创建分支</span>
        </button>
      </div>

      <div className="sidebar-section sidebar-section-flex">
        <div className="section-header">
          <span className="section-title">远程仓库</span>
        </div>

        {remotes.length > 0 ? (
          <div className="remotes-scroll-area">
            {[...remotes]
              .sort((a, b) => {
                if (a.name === currentRemote) return -1;
                if (b.name === currentRemote) return 1;
                return a.name.localeCompare(b.name);
              })
              .map((remote) => {
                const isCurrent = remote.name === currentRemote;
                return (
                  <div key={remote.name} className={`remote-card ${!isCurrent ? "remote-card-secondary" : ""}`}>
                    <div className="flex items-center gap-sm mb-xs relative z-10">
                      <div className="remote-icon">
                        <GitBranch size={12} className={isCurrent ? "text-blue-500" : "text-gray-400"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="remote-name">
                          {remote.name}
                          {isCurrent ? <span className="remote-badge">当前</span> : <span className="remote-badge-secondary">备用</span>}
                        </div>
                        <div className="remote-type">{getRemoteType(remote.url)}</div>
                      </div>
                      {!isCurrent && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onSelectRemote(remote.name)}
                            className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                            title="设为当前远程仓库"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => onRemoveRemote(remote.name)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="删除此远程仓库"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="remote-url relative z-10">{remote.url}</div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-xl text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
            <div className="text-sm font-medium mb-3">暂无远程仓库</div>
            <button onClick={onAddRemote} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              <Plus size={14} />
              添加远程仓库
            </button>
          </div>
        )}

        {remotes.length > 0 && (
          <div className="flex gap-sm mt-md">
            <button onClick={onAddRemote} className="flex-1 flex items-center justify-center gap-sm px-md py-sm bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium border border-gray-200">
              <Plus size={14} />
              <span>添加远程</span>
            </button>
            <button onClick={onOpenSyncModal} className="flex-1 sync-btn">
              <Database size={14} />
              <span>同步远程库</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
