import { Archive, Check, CircleDot, Database, DownloadCloud, FilePlus2, GitBranch, Minus, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
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
  onFetchRemote: () => void;
  onStageFiles: (files: string[]) => void;
  onUnstageFiles: (files: string[]) => void;
  onDiscardFiles: (files: string[], includeUntracked: boolean) => void;
  onStashPush: () => void;
  onStashPop: () => void;
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
  onFetchRemote,
  onStageFiles,
  onUnstageFiles,
  onDiscardFiles,
  onStashPush,
  onStashPop,
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

        <div className="git-advanced-actions">
          <button onClick={onStashPush} disabled={!gitStatus || changeCount === 0} title="储藏当前工作区变更">
            <Archive size={13} />
            <span>储藏</span>
          </button>
          <button onClick={onStashPop} title="恢复最近一次储藏">
            <Undo2 size={13} />
            <span>恢复储藏</span>
          </button>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-header">
          <span className="section-title">工作区变更</span>
          <span className="commits-count">{changeCount}</span>
        </div>

        {gitStatus && changeCount > 0 ? (
          <div className="git-change-groups">
            <ChangeGroup
              title="已暂存"
              files={gitStatus.staged}
              tone="staged"
              onPrimary={onUnstageFiles}
              onDiscard={(files) => onDiscardFiles(files, false)}
            />
            <ChangeGroup
              title="未暂存"
              files={gitStatus.unstaged}
              tone="modified"
              onPrimary={onStageFiles}
              onDiscard={(files) => onDiscardFiles(files, false)}
            />
            <ChangeGroup
              title="未跟踪"
              files={gitStatus.untracked}
              tone="untracked"
              onPrimary={onStageFiles}
              onDiscard={(files) => onDiscardFiles(files, true)}
            />
          </div>
        ) : (
          <div className="git-clean-state">
            <Check size={15} />
            <span>没有待提交变更</span>
          </div>
        )}
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
          <div className="git-remote-actions">
            <button onClick={onFetchRemote} className="git-remote-action-btn">
              <DownloadCloud size={14} />
              <span>获取</span>
            </button>
            <button onClick={onAddRemote} className="git-remote-action-btn">
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

interface ChangeGroupProps {
  title: string;
  files: string[];
  tone: "staged" | "modified" | "untracked";
  onPrimary: (files: string[]) => void;
  onDiscard: (files: string[]) => void;
}

function ChangeGroup({ title, files, tone, onPrimary, onDiscard }: ChangeGroupProps) {
  if (files.length === 0) return null;
  const primaryLabel = tone === "staged" ? "取消暂存" : "暂存";
  const PrimaryIcon = tone === "staged" ? Minus : Plus;

  return (
    <div className="git-change-group">
      <div className="git-change-group-title">
        <span>{title}</span>
        <div className="git-change-group-actions">
          <button onClick={() => onPrimary(files)} title={`${primaryLabel}全部`}>
            <PrimaryIcon size={11} />
          </button>
          <button onClick={() => onDiscard(files)} title="丢弃全部">
            <RotateCcw size={11} />
          </button>
          <span>{files.length}</span>
        </div>
      </div>
      <div className="git-change-list">
        {files.slice(0, 8).map((file) => (
          <div key={`${tone}-${file}`} className="git-change-row" title={file}>
            {tone === "untracked" ? <FilePlus2 size={12} /> : <CircleDot size={12} />}
            <span>{file}</span>
            <div className="git-change-row-actions">
              <button onClick={() => onPrimary([file])} title={primaryLabel}>
                <PrimaryIcon size={11} />
              </button>
              <button onClick={() => onDiscard([file])} title="丢弃">
                <RotateCcw size={11} />
              </button>
            </div>
          </div>
        ))}
        {files.length > 8 && <div className="git-change-more">还有 {files.length - 8} 个文件</div>}
      </div>
    </div>
  );
}
