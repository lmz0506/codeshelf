import { useState, useEffect } from "react";
import { Plus, Copy } from "lucide-react";
import type { Project, GitStatus } from "@/types";
import { getGitStatus, getRemotes } from "@/services/git";
import { openInTerminal, openInExplorer, openInEditor, toggleFavorite, removeProject, deleteProjectDirectory, updateProject } from "@/services/db";
import { launchClaudeInTerminal, getClaudeInstallationsCache } from "@/services/toolbox";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { LabelSelector } from "./LabelSelector";
import { EditorContextMenu } from "./EditorContextMenu";
import { ClaudeEnvSelector } from "./ClaudeEnvSelector";
import { useAppStore } from "@/stores/appStore";
import { getEditorForProject, getEditorConfigForProject, getEditorIcon } from "@/utils/editor";

interface ProjectCardProps {
  project: Project;
  onUpdate?: (project: Project) => void;
  onShowDetail?: (project: Project) => void;
  onDelete?: (projectId: string) => void;
}

export function ProjectCard({ project, onUpdate, onShowDetail, onDelete }: Omit<ProjectCardProps, "viewMode">) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [remoteType, setRemoteType] = useState<"github" | "gitee" | "gitlab" | "other" | "none">("none");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showEditorMenu, setShowEditorMenu] = useState<{ x: number; y: number } | null>(null);
  const [showClaudeEnvSelector, setShowClaudeEnvSelector] = useState<{ x: number; y: number } | null>(null);
  const [editingLabels, setEditingLabels] = useState<string[]>([]);
  const [copiedPath, setCopiedPath] = useState(false);
  const { terminalConfig, editors } = useAppStore();

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

  async function handleOpenTerminal(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const termType = terminalConfig.type === "default" ? undefined : terminalConfig.type;
      const termPath = terminalConfig.paths?.[terminalConfig.type as keyof typeof terminalConfig.paths];
      console.log("Opening terminal:", { path: project.path, termType, customPath: terminalConfig.customPath, termPath });
      await openInTerminal(project.path, termType, terminalConfig.customPath, termPath);
    } catch (error) {
      console.error("Failed to open terminal:", error);
      alert("打开终端失败：" + error);
    }
  }

  async function handleOpenExplorer(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await openInExplorer(project.path);
    } catch (error) {
      console.error("Failed to open explorer:", error);
      alert("打开文件夹失败：" + error);
    }
  }

  async function handleOpenEditor(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const editorPath = getEditorForProject(project, editors);
      await openInEditor(project.path, editorPath);
    } catch (error) {
      console.error("Failed to open editor:", error);
      alert("打开编辑器失败：" + error);
    }
  }

  function handleEditorContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowEditorMenu({ x: e.clientX, y: e.clientY });
  }

  async function handleCopyPath(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(project.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  }

  async function handleOpenClaude(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const cached = await getClaudeInstallationsCache();
      const installed = cached?.filter((env) => env.installed) || [];
      if (installed.length === 0) {
        alert("未检测到 Claude Code 安装，请先在工具箱中检查");
        return;
      }
      // 如果有项目级默认环境，直接使用
      if (project.claudeEnvName) {
        const env = installed.find((e) => e.envName === project.claudeEnvName);
        if (env) {
          const termType = terminalConfig.type === "default" ? undefined : terminalConfig.type;
          const termPath = terminalConfig.paths?.[terminalConfig.type as keyof typeof terminalConfig.paths];
          await launchClaudeInTerminal(project.path, termType, terminalConfig.customPath, termPath, env.envType, env.envName);
          return;
        }
      }
      if (installed.length === 1) {
        const env = installed[0];
        const termType = terminalConfig.type === "default" ? undefined : terminalConfig.type;
        const termPath = terminalConfig.paths?.[terminalConfig.type as keyof typeof terminalConfig.paths];
        await launchClaudeInTerminal(project.path, termType, terminalConfig.customPath, termPath, env.envType, env.envName);
      } else {
        setShowClaudeEnvSelector({ x: e.clientX, y: e.clientY });
      }
    } catch (error) {
      console.error("Failed to launch Claude Code:", error);
      alert("启动 Claude Code 失败：" + error);
    }
  }

  async function handleDelete(deleteDirectory: boolean) {
    try {
      if (deleteDirectory) {
        await deleteProjectDirectory(project.id);
      } else {
        await removeProject(project.id);
      }
      onDelete?.(project.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert("删除失败：" + error);
    }
  }

  async function handleSaveLabels() {
    try {
      const updated = await updateProject({ id: project.id, labels: editingLabels });
      onUpdate?.(updated);
      setShowLabelModal(false);
    } catch (error) {
      console.error("Failed to update labels:", error);
      alert("更新标签失败：" + error);
    }
  }

  function handleOpenLabelModal(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingLabels(project.labels || []);
    setShowLabelModal(true);
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
  const currentEditor = getEditorConfigForProject(project, editors);
  const editorIconText = currentEditor ? getEditorIcon(currentEditor.name) : "✏️";
  const editorTitle = currentEditor ? `用 ${currentEditor.name} 打开（右键选择）` : "打开编辑器（右键选择编辑器）";

  return (
    <>
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

        <div className="flex flex-wrap gap-1 px-4 pb-2 min-h-[28px] items-center">
          {project.labels && project.labels.length > 0 ? (
            <>
              {project.labels.slice(0, 3).map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium truncate max-w-[80px]"
                  title={label}
                >
                  {label}
                </span>
              ))}
              {project.labels.length > 3 && (
                <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-medium">
                  +{project.labels.length - 3}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-300">暂无标签</span>
          )}

          {/* 添加标签按钮 */}
          <button
            onClick={handleOpenLabelModal}
            className="inline-flex items-center justify-center w-5 h-5 bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-500 rounded text-xs border border-dashed border-gray-300 hover:border-blue-300 transition-colors ml-1"
            title="编辑标签"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="re-card-path">
          <span className="re-card-path-text">{project.path}</span>
          <button
            className={`re-card-path-copy ${copiedPath ? "re-card-path-copied" : ""}`}
            title="复制路径"
            onClick={handleCopyPath}
          >
            {copiedPath ? "✓" : <Copy size={11} />}
          </button>
        </div>

        <div className="re-card-footer">
          <span className="re-status">
            {gitStatus?.isClean === false ? "有修改" : "无修改"}
          </span>

          <div className="re-card-actions">
            <button
              className="re-icon-btn re-icon-btn-editor"
              title={editorTitle}
              onClick={handleOpenEditor}
              onContextMenu={handleEditorContextMenu}
            >
              <span className="editor-icon-text">{editorIconText}</span>
            </button>
            <button
              className="re-icon-btn"
              title="打开文件夹"
              onClick={handleOpenExplorer}
            >
              📁
            </button>
            <button
              className="re-icon-btn"
              title="终端"
              onClick={handleOpenTerminal}
            >
              💻
            </button>
            <button
              className="re-icon-btn re-icon-btn-claude"
              title="Claude Code（右键选择环境）"
              onClick={handleOpenClaude}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowClaudeEnvSelector({ x: e.clientX, y: e.clientY });
              }}
            >
              <span className="claude-icon-text">C</span>
            </button>
            <button
              className="re-icon-btn"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {showDeleteDialog && (
        <DeleteConfirmDialog
          projectName={project.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}

      {showEditorMenu && (
        <EditorContextMenu
          project={project}
          position={showEditorMenu}
          onClose={() => setShowEditorMenu(null)}
        />
      )}

      {showClaudeEnvSelector && (
        <ClaudeEnvSelector
          project={project}
          position={showClaudeEnvSelector}
          onClose={() => setShowClaudeEnvSelector(null)}
        />
      )}

      {/* 标签编辑弹框 */}
      {showLabelModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowLabelModal(false)}>
          <div className="modal-content animate-scale-in max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">编辑标签</h3>
                <p className="modal-subtitle">为「{project.name}」设置技术栈标签</p>
              </div>
              <button
                onClick={() => setShowLabelModal(false)}
                className="modal-close-btn"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <LabelSelector
                selectedLabels={editingLabels}
                onChange={setEditingLabels}
                multiple={true}
              />
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setShowLabelModal(false)}
                className="modal-btn modal-btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleSaveLabels}
                className="modal-btn modal-btn-primary"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
