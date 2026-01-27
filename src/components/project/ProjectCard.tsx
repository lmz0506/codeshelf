import { useState, useEffect } from "react";
import {
  Star,
  GitBranch,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Terminal,
  MoreVertical,
  Github,
  Globe,
  HardDrive,
} from "lucide-react";
import type { Project, GitStatus, RemoteInfo } from "@/types";
import { getGitStatus, getRemotes } from "@/services/git";
import { openInEditor, openInTerminal, toggleFavorite } from "@/services/db";

interface ProjectCardProps {
  project: Project;
  viewMode: "grid" | "list";
  onUpdate?: (project: Project) => void;
  onShowDetail?: (project: Project) => void;
}

export function ProjectCard({ project, viewMode, onUpdate, onShowDetail }: ProjectCardProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [remoteType, setRemoteType] = useState<"github" | "gitee" | "gitlab" | "other" | "none">("none");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGitInfo();
  }, [project.path]);

  async function loadGitInfo() {
    try {
      setLoading(true);
      const [status, remotes] = await Promise.all([
        getGitStatus(project.path),
        getRemotes(project.path),
      ]);
      setGitStatus(status);

      // Determine remote type
      if (remotes.length > 0) {
        const url = remotes[0].url.toLowerCase();
        if (url.includes("github.com")) {
          setRemoteType("github");
        } else if (url.includes("gitee.com")) {
          setRemoteType("gitee");
        } else if (url.includes("gitlab")) {
          setRemoteType("gitlab");
        } else {
          setRemoteType("other");
        }
      } else {
        setRemoteType("none");
      }
    } catch (error) {
      console.error("Failed to load git info:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const updated = await toggleFavorite(project.id);
      onUpdate?.(updated);
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  }

  async function handleOpenEditor(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await openInEditor(project.path);
    } catch (error) {
      console.error("Failed to open in editor:", error);
    }
  }

  async function handleOpenTerminal(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await openInTerminal(project.path);
    } catch (error) {
      console.error("Failed to open terminal:", error);
    }
  }

  function getRemoteIcon() {
    switch (remoteType) {
      case "github":
        return <Github className="w-4 h-4" />;
      case "gitee":
      case "gitlab":
      case "other":
        return <Globe className="w-4 h-4" />;
      case "none":
        return <HardDrive className="w-4 h-4" />;
    }
  }

  function getRemoteLabel() {
    switch (remoteType) {
      case "github":
        return "GitHub";
      case "gitee":
        return "Gitee";
      case "gitlab":
        return "GitLab";
      case "other":
        return "远程";
      case "none":
        return "本地";
    }
  }

  if (viewMode === "list") {
    return (
      <div
        onClick={() => onShowDetail?.(project)}
        className="flex items-center gap-5 px-5 py-4 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-border-hover)] hover:shadow-sm transition-all cursor-pointer"
      >
        <button
          onClick={handleToggleFavorite}
          className={`p-1.5 rounded-lg transition-colors ${
            project.isFavorite
              ? "text-amber-500"
              : "text-[var(--color-text-muted)] hover:text-amber-500 hover:bg-[var(--color-bg-tertiary)]"
          }`}
        >
          <Star className="w-5 h-5" fill={project.isFavorite ? "currentColor" : "none"} />
        </button>

        <div className="flex-1 min-w-0">
          <h3 className="text-[var(--color-text-primary)] font-medium truncate text-[15px]">{project.name}</h3>
          <p className="text-[var(--color-text-muted)] text-sm truncate mt-1">{project.path}</p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-tertiary)] rounded-full">
          {getRemoteIcon()}
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            {getRemoteLabel()}
          </span>
        </div>

        {gitStatus && (
          <div className="flex items-center gap-5 text-sm">
            <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
              <GitBranch className="w-4 h-4" />
              <span className="font-medium">{gitStatus.branch}</span>
            </div>
            {gitStatus.ahead > 0 && (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <ArrowUp className="w-4 h-4" />
                <span className="font-medium">{gitStatus.ahead}</span>
              </div>
            )}
            {gitStatus.behind > 0 && (
              <div className="flex items-center gap-1.5 text-orange-500">
                <ArrowDown className="w-4 h-4" />
                <span className="font-medium">{gitStatus.behind}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenEditor}
            className="p-2.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            title="在编辑器中打开"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenTerminal}
            className="p-2.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            title="打开终端"
          >
            <Terminal className="w-4 h-4" />
          </button>
          <button className="p-2.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      onClick={() => onShowDetail?.(project)}
      className="flex flex-col p-5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-border-hover)] hover:shadow-sm transition-all min-h-[200px] cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-[var(--color-text-primary)] font-semibold truncate flex-1 pr-2 text-[15px] leading-snug">{project.name}</h3>
        <button
          onClick={handleToggleFavorite}
          className={`p-1 rounded-lg transition-colors flex-shrink-0 ${
            project.isFavorite
              ? "text-amber-500"
              : "text-[var(--color-text-muted)] hover:text-amber-500"
          }`}
        >
          <Star className="w-4 h-4" fill={project.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <p className="text-[var(--color-text-muted)] text-sm truncate mb-4 leading-relaxed">{project.path}</p>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-tertiary)] rounded-full">
          {getRemoteIcon()}
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">
            {getRemoteLabel()}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-6 bg-[var(--color-bg-tertiary)] rounded-md animate-pulse" />
      ) : (
        gitStatus && (
          <div className="flex items-center gap-4 text-sm mb-5">
            <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
              <GitBranch className="w-4 h-4" />
              <span className="truncate max-w-[100px] font-medium">{gitStatus.branch}</span>
            </div>
            {gitStatus.ahead > 0 && (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <ArrowUp className="w-3.5 h-3.5" />
                <span className="font-medium">{gitStatus.ahead}</span>
              </div>
            )}
            {gitStatus.behind > 0 && (
              <div className="flex items-center gap-1.5 text-orange-500">
                <ArrowDown className="w-3.5 h-3.5" />
                <span className="font-medium">{gitStatus.behind}</span>
              </div>
            )}
            {!gitStatus.isClean && (
              <span className="text-amber-600 dark:text-amber-400 text-xs font-medium px-2.5 py-1 bg-amber-50 dark:bg-amber-500/10 rounded-full">有修改</span>
            )}
          </div>
        )
      )}

      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {project.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-full font-medium"
            >
              {tag}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="px-2 py-1 text-xs text-[var(--color-text-muted)]">
              +{project.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mt-auto pt-4 border-t border-[var(--color-border)]">
        <button
          onClick={handleOpenEditor}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>编辑器</span>
        </button>
        <button
          onClick={handleOpenTerminal}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
        >
          <Terminal className="w-4 h-4" />
          <span>终端</span>
        </button>
      </div>
    </div>
  );
}
