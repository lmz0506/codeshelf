import { useState, useEffect } from "react";
import type { Project, GitStatus } from "@/types";
import { getGitStatus, getRemotes } from "@/services/git";
import { openInEditor, openInTerminal, toggleFavorite } from "@/services/db";

interface ProjectCardProps {
  project: Project;
  onUpdate?: (project: Project) => void;
  onShowDetail?: (project: Project) => void;
}

export function ProjectCard({ project, onUpdate, onShowDetail }: Omit<ProjectCardProps, "viewMode">) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [remoteType, setRemoteType] = useState<"github" | "gitee" | "gitlab" | "other" | "none">("none");

  useEffect(() => {
    loadGitInfo();
  }, [project.path]);

  async function loadGitInfo() {
    try {
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

  function getRemoteLabel() {
    switch (remoteType) {
      case "github":
        return "☆GitHub";
      case "gitee":
        return "@Gitee";
      case "gitlab":
        return "🦊GitLab";
      case "other":
        return "🌐Other";
      default:
        return "📦Local";
    }
  }

  // exact 1:1 reproduction from example.html CSS
  return (
    <div
      onClick={() => onShowDetail?.(project)}
      className="re-card"
    >
      <div className="re-card-header">
        <h4>{project.name}</h4>
        <span
          className="re-star"
          title={project.isFavorite ? "取消收藏" : "收藏"}
          onClick={handleToggleFavorite}
        >
          {project.isFavorite ? "★" : "☆"}
        </span>
      </div>

      <div className="re-card-meta">
        {getRemoteLabel()} {gitStatus?.branch ? `· ${gitStatus.branch}` : ""}
      </div>

      <div className="re-card-cat">
        分类：{project.tags.length > 0 ? project.tags.join(", ") : "未分类"}
      </div>

      <div className="re-card-path">
        {project.path}
      </div>

      <div className="re-card-footer">
        <span className="re-status">
          {gitStatus?.isClean === false ? "有修改" : "无修改"}
        </span>

        <div className="re-card-actions">
          <button
            className="re-icon-btn"
            title="编辑器"
            onClick={handleOpenEditor}
          >
            📝
          </button>
          <button
            className="re-icon-btn"
            title="终端"
            onClick={handleOpenTerminal}
          >
            💻
          </button>
        </div>
      </div>
    </div>
  );
}
