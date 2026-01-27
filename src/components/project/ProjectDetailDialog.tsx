import { useState, useEffect } from "react";
import { X, GitBranch, GitCommit, FolderGit2, ExternalLink, Terminal, Github, Globe } from "lucide-react";
import { Button } from "@/components/ui";
import type { Project, GitStatus, CommitInfo, RemoteInfo } from "@/types";
import { getGitStatus, getCommitHistory, getRemotes } from "@/services/git";
import { openInEditor, openInTerminal } from "@/services/db";

interface ProjectDetailDialogProps {
  project: Project;
  onClose: () => void;
}

export function ProjectDetailDialog({ project, onClose }: ProjectDetailDialogProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjectDetails();
  }, [project.path]);

  async function loadProjectDetails() {
    try {
      setLoading(true);
      const [status, commitHistory, remoteList] = await Promise.all([
        getGitStatus(project.path),
        getCommitHistory(project.path, 10),
        getRemotes(project.path),
      ]);
      setGitStatus(status);
      setCommits(commitHistory);
      setRemotes(remoteList);
    } catch (error) {
      console.error("Failed to load project details:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenEditor() {
    try {
      await openInEditor(project.path);
    } catch (error) {
      console.error("Failed to open in editor:", error);
    }
  }

  async function handleOpenTerminal() {
    try {
      await openInTerminal(project.path);
    } catch (error) {
      console.error("Failed to open terminal:", error);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-8 py-6 border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">
              {project.name}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] truncate">
              {project.path}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Git Status */}
              {gitStatus && (
                <section>
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                    Git 状态
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4">
                      <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] mb-2">
                        <GitBranch className="w-4 h-4" />
                        <span className="text-sm font-medium">当前分支</span>
                      </div>
                      <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                        {gitStatus.branch}
                      </p>
                    </div>
                    <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4">
                      <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] mb-2">
                        <GitCommit className="w-4 h-4" />
                        <span className="text-sm font-medium">工作区状态</span>
                      </div>
                      <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                        {gitStatus.isClean ? "干净" : `${gitStatus.unstaged.length + gitStatus.untracked.length} 个修改`}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Remotes */}
              {remotes.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                    远程仓库
                  </h3>
                  <div className="space-y-3">
                    {remotes.map((remote) => (
                      <div
                        key={remote.name}
                        className="bg-[var(--color-bg-secondary)] rounded-xl p-4"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {remote.url.includes("github.com") ? (
                            <Github className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                          ) : (
                            <Globe className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                          )}
                          <span className="font-medium text-[var(--color-text-primary)]">
                            {remote.name}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--color-text-muted)] break-all">
                          {remote.url}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Recent Commits */}
              {commits.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                    最近提交
                  </h3>
                  <div className="space-y-3">
                    {commits.map((commit) => (
                      <div
                        key={commit.hash}
                        className="bg-[var(--color-bg-secondary)] rounded-xl p-4"
                      >
                        <div className="flex items-start gap-3">
                          <code className="text-xs font-mono bg-[var(--color-bg-tertiary)] px-2 py-1 rounded text-[var(--color-text-tertiary)] flex-shrink-0">
                            {commit.shortHash}
                          </code>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
                              {commit.message}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {commit.author} · {new Date(commit.date).toLocaleString("zh-CN")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleOpenEditor}>
              <ExternalLink className="w-4 h-4 mr-2" />
              在编辑器中打开
            </Button>
            <Button variant="secondary" onClick={handleOpenTerminal}>
              <Terminal className="w-4 h-4 mr-2" />
              打开终端
            </Button>
          </div>
          <Button onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  );
}
