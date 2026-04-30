import { ChangeEvent, useMemo } from "react";
import { History, RefreshCw, Search } from "lucide-react";
import type { CommitInfo, RemoteInfo } from "@/types";
import { CommitCard } from "./CommitCard";
import { GitStatusSummary } from "./GitStatusSummary";
import type { GitStatus } from "@/types";

interface CommitHistoryPanelProps {
  projectPath: string;
  commits: CommitInfo[];
  remotes: RemoteInfo[];
  gitStatus: GitStatus | null;
  currentRemote: string | null;
  loading: boolean;
  expandedCommit: string | null;
  copiedHash: string | null;
  searchQuery: string;
  historyLimit: number;
  activeView: "history" | "ahead" | "behind";
  onRefresh: () => void;
  onShowHistory: () => void;
  onShowAhead: () => void;
  onShowBehind: () => void;
  onSearchChange: (query: string) => void;
  onLoadMore: () => void;
  onToggleCommit: (hash: string) => void;
  onCopyHash: (hash: string) => void;
  onCopyMessage: (message: string) => void;
  onRevertCommit: (commit: CommitInfo) => void;
  onCherryPickCommit: (commit: CommitInfo) => void;
}

export function CommitHistoryPanel({
  projectPath,
  commits,
  remotes,
  gitStatus,
  currentRemote,
  loading,
  expandedCommit,
  copiedHash,
  searchQuery,
  historyLimit,
  activeView,
  onRefresh,
  onShowHistory,
  onShowAhead,
  onShowBehind,
  onSearchChange,
  onLoadMore,
  onToggleCommit,
  onCopyHash,
  onCopyMessage,
  onRevertCommit,
  onCherryPickCommit,
}: CommitHistoryPanelProps) {
  const visibleCommits = useMemo(() => commits, [commits]);
  const emptyText = searchQuery.trim()
    ? "没有匹配的提交"
    : activeView === "ahead"
      ? "没有本地未推送的提交"
      : activeView === "behind"
        ? "没有远程未拉取的提交"
        : "暂无提交记录";

  return (
    <main className="project-detail-main">
      <div className="commits-header git-toolbar">
        <div className="commits-title">
          <History size={16} className="text-gray-500" />
          <span className="commits-title-text">{activeView === "ahead" ? "待推送提交" : activeView === "behind" ? "待拉取提交" : "最近提交"}</span>
          <span className="commits-count">{visibleCommits.length}</span>
        </div>

        <div className="git-toolbar-actions">
          <label className="git-search-box">
            <Search size={14} />
            <input
              value={searchQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
              placeholder="搜索提交信息"
            />
          </label>
          <button onClick={onRefresh} className="icon-btn" title="刷新">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="commits-list">
        <GitStatusSummary
          gitStatus={gitStatus}
          currentRemote={currentRemote}
          activeView={activeView}
          onShowHistory={onShowHistory}
          onShowAhead={onShowAhead}
          onShowBehind={onShowBehind}
        />

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="loading-spinner"></div>
          </div>
        ) : visibleCommits.length === 0 ? (
          <div className="empty-state">
            <History size={48} className="empty-state-icon" />
            <p className="empty-state-text">{emptyText}</p>
          </div>
        ) : (
          <>
            {visibleCommits.map((commit, index) => (
              <CommitCard
                key={commit.hash}
                projectPath={projectPath}
                commit={commit}
                index={index}
                isLast={index === visibleCommits.length - 1}
                isExpanded={expandedCommit === commit.hash}
                remotes={remotes}
                currentRemote={currentRemote}
                copiedHash={copiedHash}
                onToggle={() => onToggleCommit(commit.hash)}
                onCopyHash={onCopyHash}
                onCopyMessage={onCopyMessage}
                onRevertCommit={onRevertCommit}
                onCherryPickCommit={onCherryPickCommit}
              />
            ))}
            {!searchQuery.trim() && visibleCommits.length >= historyLimit && (
              <button className="load-more-commits-btn" onClick={onLoadMore}>
                加载更多提交
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
