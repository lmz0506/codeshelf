import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Files,
  Mail,
  GitPullRequestArrow,
  RotateCcw,
  User,
} from "lucide-react";
import type { CommitFileChange, CommitInfo, RemoteInfo } from "@/types";
import { getCommitFiles } from "@/services/git";
import { openUrl } from "@/services/db";
import { cleanRefName, formatRelativeTime, getRefType, getRemoteCommitUrl } from "./gitUtils";

interface CommitCardProps {
  projectPath: string;
  commit: CommitInfo;
  index: number;
  isLast: boolean;
  isExpanded: boolean;
  remotes: RemoteInfo[];
  currentRemote: string | null;
  copiedHash: string | null;
  onToggle: () => void;
  onCopyHash: (hash: string) => void;
  onCopyMessage: (message: string) => void;
  onRevertCommit: (commit: CommitInfo) => void;
  onCherryPickCommit: (commit: CommitInfo) => void;
}

export function CommitCard({
  projectPath,
  commit,
  index,
  isLast,
  isExpanded,
  remotes,
  currentRemote,
  copiedHash,
  onToggle,
  onCopyHash,
  onCopyMessage,
  onRevertCommit,
  onCherryPickCommit,
}: CommitCardProps) {
  const [files, setFiles] = useState<CommitFileChange[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const remoteUrl = getRemoteCommitUrl(remotes, currentRemote, commit.hash);

  useEffect(() => {
    if (!isExpanded || filesLoaded || filesLoading) return;

    setFilesLoading(true);
    setFilesError(null);
    getCommitFiles(projectPath, commit.hash)
      .then((result) => {
        setFiles(result);
        setFilesLoaded(true);
      })
      .catch((error) => {
        setFilesError(String(error));
      })
      .finally(() => setFilesLoading(false));
  }, [commit.hash, filesLoaded, filesLoading, isExpanded, projectPath]);

  return (
    <div
      className={`commit-card ${index === 0 ? "commit-card-newest" : ""} ${isExpanded ? "commit-card-expanded" : ""} animate-slide-up`}
      style={{ animationDelay: `${Math.min(index, 8) * 0.035}s` }}
    >
      <div className="flex items-start gap-md">
        <div className="flex flex-col items-center self-stretch pt-xs">
          <div className="commit-dot"></div>
          {!isLast && <div className="commit-line"></div>}
        </div>

        <div className="flex-1 min-w-0 pb-xs">
          <div className="flex items-start justify-between gap-sm cursor-pointer" onClick={onToggle}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-sm mb-xs">
                <button className="commit-expand-toggle" type="button">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="commit-message line-clamp-1">{commit.message}</span>
                {index === 0 && <span className="commit-badge-new">最新</span>}
              </div>

              <div className="flex items-center gap-md text-sm text-gray-600 ml-6 flex-wrap">
                <span className="commit-hash">{commit.shortHash}</span>
                <span className="commit-author">
                  <User size={12} />
                  {commit.author}
                </span>
                <span className="commit-date" title={new Date(commit.date).toLocaleString("zh-CN")}>
                  <Clock size={12} />
                  {formatRelativeTime(commit.date)}
                </span>
              </div>

              {(commit.filesChanged !== undefined || commit.insertions !== undefined || commit.deletions !== undefined) && (
                <div className="commit-stats ml-6">
                  {commit.filesChanged !== undefined && (
                    <span className="commit-stat-files">
                      <Files size={11} />
                      {commit.filesChanged} 文件
                    </span>
                  )}
                  {commit.insertions !== undefined && commit.insertions > 0 && (
                    <span className="commit-stat-add">+{commit.insertions}</span>
                  )}
                  {commit.deletions !== undefined && commit.deletions > 0 && (
                    <span className="commit-stat-del">-{commit.deletions}</span>
                  )}
                </div>
              )}

              {commit.refs && commit.refs.length > 0 && (
                <div className="commit-refs ml-6">
                  {commit.refs.map((ref, refIndex) => {
                    const refType = getRefType(ref);
                    const refClass = refType === "head" ? "ref-tag-head" : refType === "remote" ? "ref-tag-remote" : refType === "tag" ? "ref-tag-tag" : "";
                    return (
                      <span key={`${ref}-${refIndex}`} className={`ref-tag ${refClass}`}>
                        {cleanRefName(ref)}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="commit-detail ml-6">
              {commit.body && <div className="commit-body">{commit.body}</div>}

              <div className="commit-full-hash">
                <span>完整哈希:</span>
                <code>{commit.hash}</code>
              </div>

              <div className="commit-full-hash">
                <Mail size={12} />
                <span>{commit.email}</span>
              </div>

              <div className="commit-files-panel">
                <div className="commit-files-title">
                  <FileText size={12} />
                  <span>文件变更</span>
                </div>
                {filesLoading ? (
                  <span className="commit-files-muted">加载中...</span>
                ) : filesError ? (
                  <span className="commit-files-error">{filesError}</span>
                ) : files.length === 0 ? (
                  <span className="commit-files-muted">没有文件变更明细</span>
                ) : (
                  <div className="commit-files-list">
                    {files.slice(0, 12).map((file) => (
                      <div key={file.filename} className="commit-file-row">
                        <span className="commit-file-name" title={file.filename}>{file.filename}</span>
                        <span className="commit-stat-add">+{file.insertions}</span>
                        <span className="commit-stat-del">-{file.deletions}</span>
                      </div>
                    ))}
                    {files.length > 12 && <div className="commit-files-muted">还有 {files.length - 12} 个文件未显示</div>}
                  </div>
                )}
              </div>

              <div className="commit-actions">
                <button
                  className={`commit-action-btn ${copiedHash === commit.hash ? "commit-action-btn-success" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyHash(commit.hash);
                  }}
                >
                  {copiedHash === commit.hash ? <Check size={12} /> : <Copy size={12} />}
                  {copiedHash === commit.hash ? "已复制" : "复制哈希"}
                </button>
                {remoteUrl && (
                  <button
                    className="commit-action-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      openUrl(remoteUrl);
                    }}
                  >
                    <ExternalLink size={12} />
                    在远程查看
                  </button>
                )}
                <button
                  className="commit-action-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyMessage(commit.message);
                  }}
                >
                  <Copy size={12} />
                  复制提交说明
                </button>
                <button
                  className="commit-action-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRevertCommit(commit);
                  }}
                >
                  <RotateCcw size={12} />
                  revert
                </button>
                <button
                  className="commit-action-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCherryPickCommit(commit);
                  }}
                >
                  <GitPullRequestArrow size={12} />
                  cherry-pick
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
