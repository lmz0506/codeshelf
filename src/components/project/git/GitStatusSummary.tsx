import { ArrowDownToLine, ArrowUpFromLine, GitBranch, Layers3, Server } from "lucide-react";
import type { GitStatus } from "@/types";

interface GitStatusSummaryProps {
  gitStatus: GitStatus | null;
  currentRemote: string | null;
  activeView: "history" | "ahead" | "behind";
  onShowHistory: () => void;
  onShowAhead: () => void;
  onShowBehind: () => void;
}

export function GitStatusSummary({ gitStatus, currentRemote, activeView, onShowHistory, onShowAhead, onShowBehind }: GitStatusSummaryProps) {
  const staged = gitStatus?.staged.length || 0;
  const unstaged = gitStatus?.unstaged.length || 0;
  const untracked = gitStatus?.untracked.length || 0;
  const conflicted = gitStatus?.conflicted.length || 0;
  const changes = staged + unstaged + untracked + conflicted;

  return (
    <div className="git-summary-strip">
      <button className={`git-summary-item ${activeView === "history" ? "git-summary-active" : ""}`} onClick={onShowHistory} title="查看最近提交">
        <GitBranch size={15} />
        <div>
          <span className="git-summary-label">当前分支</span>
          <strong>{gitStatus?.branch || "unknown"}</strong>
        </div>
      </button>
      <div className={`git-summary-item ${changes > 0 ? "git-summary-warn" : "git-summary-ok"}`}>
        <Layers3 size={15} />
        <div>
          <span className="git-summary-label">工作区</span>
          <strong>{conflicted > 0 ? `${conflicted} 个冲突` : changes > 0 ? `${changes} 个变更` : "干净"}</strong>
        </div>
      </div>
      <button className={`git-summary-item ${(gitStatus?.ahead || 0) > 0 ? "git-summary-info" : ""} ${activeView === "ahead" ? "git-summary-active" : ""}`} onClick={onShowAhead} title="查看本地未推送到远程的提交">
        <ArrowUpFromLine size={15} />
        <div>
          <span className="git-summary-label">待推送</span>
          <strong>{gitStatus?.ahead || 0}</strong>
        </div>
      </button>
      <button className={`git-summary-item ${(gitStatus?.behind || 0) > 0 ? "git-summary-warn" : ""} ${activeView === "behind" ? "git-summary-active" : ""}`} onClick={onShowBehind} title="查看远程已有但本地未拉取的提交">
        <ArrowDownToLine size={15} />
        <div>
          <span className="git-summary-label">待拉取</span>
          <strong>{gitStatus?.behind || 0}</strong>
        </div>
      </button>
      <div className="git-summary-item">
        <Server size={15} />
        <div>
          <span className="git-summary-label">当前远程</span>
          <strong>{currentRemote || "无"}</strong>
        </div>
      </div>
    </div>
  );
}
