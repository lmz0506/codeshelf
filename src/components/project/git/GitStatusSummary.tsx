import { ArrowDownToLine, ArrowUpFromLine, GitBranch, Layers3, Server } from "lucide-react";
import type { GitStatus } from "@/types";

interface GitStatusSummaryProps {
  gitStatus: GitStatus | null;
  currentRemote: string | null;
}

export function GitStatusSummary({ gitStatus, currentRemote }: GitStatusSummaryProps) {
  const staged = gitStatus?.staged.length || 0;
  const unstaged = gitStatus?.unstaged.length || 0;
  const untracked = gitStatus?.untracked.length || 0;
  const conflicted = gitStatus?.conflicted.length || 0;
  const changes = staged + unstaged + untracked + conflicted;

  return (
    <div className="git-summary-strip">
      <div className="git-summary-item">
        <GitBranch size={15} />
        <div>
          <span className="git-summary-label">分支</span>
          <strong>{gitStatus?.branch || "unknown"}</strong>
        </div>
      </div>
      <div className={`git-summary-item ${changes > 0 ? "git-summary-warn" : "git-summary-ok"}`}>
        <Layers3 size={15} />
        <div>
          <span className="git-summary-label">工作区</span>
          <strong>{conflicted > 0 ? `${conflicted} 个冲突` : changes > 0 ? `${changes} 个变更` : "干净"}</strong>
        </div>
      </div>
      <div className={`git-summary-item ${(gitStatus?.ahead || 0) > 0 ? "git-summary-info" : ""}`}>
        <ArrowUpFromLine size={15} />
        <div>
          <span className="git-summary-label">待推送</span>
          <strong>{gitStatus?.ahead || 0}</strong>
        </div>
      </div>
      <div className={`git-summary-item ${(gitStatus?.behind || 0) > 0 ? "git-summary-warn" : ""}`}>
        <ArrowDownToLine size={15} />
        <div>
          <span className="git-summary-label">待拉取</span>
          <strong>{gitStatus?.behind || 0}</strong>
        </div>
      </div>
      <div className="git-summary-item">
        <Server size={15} />
        <div>
          <span className="git-summary-label">远程</span>
          <strong>{currentRemote || "无"}</strong>
        </div>
      </div>
    </div>
  );
}
