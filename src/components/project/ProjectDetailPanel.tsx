import { useState, useEffect } from "react";
import { X, GitBranch, Terminal, RefreshCw, CloudUpload, FolderOpen, Edit2, FileText, Loader2, GitCommit, Copy, Minus, Maximize2, Minimize2, ArrowRightLeft, Box, MessageSquare } from "lucide-react";
import { CategorySelector } from "./CategorySelector";
import { LabelSelector } from "./LabelSelector";
import { SyncRemoteModal } from "./SyncRemoteModal";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { BranchSwitchModal } from "./BranchSwitchModal";
import { GitCommitModal } from "./GitCommitModal";
import { AddRemoteModal } from "./AddRemoteModal";
import { EditorContextMenu } from "./EditorContextMenu";
import { TerminalContextMenu } from "./TerminalContextMenu";
import { CommitHistoryPanel } from "./git/CommitHistoryPanel";
import { GitSidebar } from "./git/GitSidebar";
import { showToast } from "@/components/ui";
import type { Project, GitStatus, CommitInfo, RemoteInfo } from "@/types";
import {
  getGitStatus,
  getCommitHistory,
  getRemotes,
  gitPull,
  gitPush,
  removeRemote,
  searchCommits,
  gitAdd,
  gitUnstage,
  gitDiscardFiles,
  gitStashPush,
  gitStashPop,
  gitFetch,
} from "@/services/git";
import { openInEditor, openInExplorer, openInTerminal, updateProject } from "@/services/db";
import { getEditorForProject, getEditorConfigForProject, getEditorIcon } from "@/utils/editor";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createChatSession, saveChatSession } from "@/services/chat";

interface ProjectDetailPanelProps {
  project: Project;
  onClose: () => void;
  onUpdate?: (project: Project) => void;
  onSwitchProject?: (project: Project) => void;
}

export function ProjectDetailPanel({ project, onClose, onUpdate, onSwitchProject }: ProjectDetailPanelProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [currentRemote, setCurrentRemote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showReadme, setShowReadme] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [showAddRemoteModal, setShowAddRemoteModal] = useState(false);
  const [showEditorMenu, setShowEditorMenu] = useState<{ x: number; y: number } | null>(null);
  const [showTerminalMenu, setShowTerminalMenu] = useState<{ x: number; y: number } | null>(null);
  const [readmeContent, setReadmeContent] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(project.tags);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(project.labels || []);
  // 用于显示的本地项目数据（编辑后立即更新）
  const [localProject, setLocalProject] = useState<Project>(project);
  const {
    editors,
    terminalConfig,
    markProjectDirty,
    projects,
    recentDetailProjectIds,
    addRecentDetailProject,
    navigateToDockerTool,
    navigateToChatSession,
    aiProviders,
    ensureAiDefaultProvider,
    setCurrentPage,
  } = useAppStore();
  // 从 store 读取最新项目数据（编辑器/Claude 环境切换后立即刷新）
  const storeProject = projects.find((p) => p.id === project.id) || project;

  // 提交卡片展开状态
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");

  // 窗口最大化状态
  const [isMaximized, setIsMaximized] = useState(false);

  // 获取最近打开的项目列表（排除当前项目）
  const recentProjects = recentDetailProjectIds
    .filter((id) => id !== project.id)
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => p !== undefined)
    .slice(0, 8);

  // 记录当前项目到最近打开历史
  useEffect(() => {
    addRecentDetailProject(project.id);
  }, [project.id, addRecentDetailProject]);

  // 复制哈希到剪贴板
  async function copyHash(hash: string) {
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
    showToast("success", "已复制", "哈希值已复制到剪贴板");
  }

  // 检查窗口最大化状态
  useEffect(() => {
    checkMaximized();
    const handleResize = () => checkMaximized();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function checkMaximized() {
    try {
      const appWindow = getCurrentWindow();
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    } catch (error) {
      console.error("Failed to check maximized state:", error);
    }
  }

  async function handleToggleMaximize() {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      checkMaximized();
    } catch (error) {
      console.error("Failed to toggle maximize:", error);
    }
  }

  async function handleMinimize() {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error("Failed to minimize:", error);
    }
  }

  // 当外部 project prop 改变时同步本地状态
  useEffect(() => {
    setLocalProject(project);
    setSelectedCategories(project.tags);
    setSelectedLabels(project.labels || []);
  }, [project.id, project.tags, project.labels]);

  useEffect(() => {
    loadProjectDetails();
  }, [project.path, historyLimit]);

  // 当远程列表加载完成后，设置默认当前远程
  useEffect(() => {
    if (remotes.length > 0 && !currentRemote) {
      setCurrentRemote(remotes[0].name);
    }
  }, [remotes, currentRemote]);

  // 当切换远程仓库时，重新获取提交历史
  useEffect(() => {
    if (currentRemote && gitStatus?.branch) {
      loadCommitHistory();
    }
  }, [currentRemote, gitStatus?.branch, historyLimit]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      loadCommitHistory();
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const result = await searchCommits(project.path, query, "message", 50);
        setCommits(result);
      } catch (error) {
        console.error("Failed to search commits:", error);
        setCommits([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [project.path, searchQuery]);

  async function loadCommitHistory() {
    if (!gitStatus?.branch) return;
    try {
      const refName = currentRemote ? `${currentRemote}/${gitStatus.branch}` : undefined;
      const commitHistory = await getCommitHistory(project.path, historyLimit, refName);
      setCommits(commitHistory);
    } catch (error) {
      console.error("Failed to load commit history:", error);
      try {
        const localCommits = await getCommitHistory(project.path, historyLimit);
        setCommits(localCommits);
      } catch {
        setCommits([]);
      }
    }
  }

  async function loadProjectDetails() {
    try {
      setLoading(true);
      const [status, remoteList] = await Promise.all([
        getGitStatus(project.path),
        getRemotes(project.path),
      ]);
      setGitStatus(status);
      setRemotes(remoteList);

      if (status.branch) {
        const selectedRemote = currentRemote || remoteList[0]?.name;
        const refName = selectedRemote ? `${selectedRemote}/${status.branch}` : undefined;
        try {
          const commitHistory = await getCommitHistory(project.path, historyLimit, refName);
          setCommits(commitHistory);
        } catch {
          try {
            const localCommits = await getCommitHistory(project.path, historyLimit);
            setCommits(localCommits);
          } catch {
            setCommits([]);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load project details:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePull() {
    if (!gitStatus || !currentRemote || pulling) return;
    try {
      setPulling(true);
      await gitPull(project.path, currentRemote, gitStatus.branch);
      await loadProjectDetails();
      markProjectDirty(project.path); // Mark for stats refresh
      showToast("success", "拉取成功", `已从 ${currentRemote}/${gitStatus.branch} 拉取最新代码`);
    } catch (error) {
      console.error("Failed to pull:", error);
      showToast("error", "拉取失败", String(error));
    } finally {
      setPulling(false);
    }
  }

  async function handlePush() {
    if (!gitStatus || !currentRemote || pushing) return;
    try {
      setPushing(true);
      await gitPush(project.path, currentRemote, gitStatus.branch);
      await loadProjectDetails();
      markProjectDirty(project.path); // Mark for stats refresh
      showToast("success", "推送成功", `已推送到 ${currentRemote}/${gitStatus.branch}`);
    } catch (error) {
      console.error("Failed to push:", error);
      showToast("error", "推送失败", String(error));
    } finally {
      setPushing(false);
    }
  }

  async function refreshGitState() {
    await loadProjectDetails();
    markProjectDirty(project.path);
  }

  async function handleStageFiles(files: string[]) {
    try {
      await gitAdd(project.path, files);
      await refreshGitState();
      showToast("success", "已暂存", files.length === 1 ? files[0] : `已暂存 ${files.length} 个文件`);
    } catch (error) {
      console.error("Failed to stage files:", error);
      showToast("error", "暂存失败", String(error));
    }
  }

  async function handleUnstageFiles(files: string[]) {
    try {
      await gitUnstage(project.path, files);
      await refreshGitState();
      showToast("success", "已取消暂存", files.length === 1 ? files[0] : `已取消暂存 ${files.length} 个文件`);
    } catch (error) {
      console.error("Failed to unstage files:", error);
      showToast("error", "取消暂存失败", String(error));
    }
  }

  async function handleDiscardFiles(files: string[], includeUntracked: boolean) {
    const label = files.length === 1 ? files[0] : `${files.length} 个文件`;
    if (!confirm(`确定要丢弃 ${label} 的本地变更吗？此操作不可撤销。`)) return;

    try {
      await gitDiscardFiles(project.path, files, includeUntracked);
      await refreshGitState();
      showToast("success", "已丢弃变更", label);
    } catch (error) {
      console.error("Failed to discard files:", error);
      showToast("error", "丢弃失败", String(error));
    }
  }

  async function handleStashPush() {
    try {
      await gitStashPush(project.path, `CodeShelf: ${project.name}`);
      await refreshGitState();
      showToast("success", "已储藏变更", "当前工作区变更已保存到 stash");
    } catch (error) {
      console.error("Failed to stash changes:", error);
      showToast("error", "储藏失败", String(error));
    }
  }

  async function handleStashPop() {
    if (!confirm("确定要恢复最近一次 stash 吗？如果发生冲突，需要手动处理。")) return;

    try {
      await gitStashPop(project.path);
      await refreshGitState();
      showToast("success", "已恢复储藏", "最近一次 stash 已应用到工作区");
    } catch (error) {
      console.error("Failed to pop stash:", error);
      showToast("error", "恢复储藏失败", String(error));
    }
  }

  async function handleFetchRemote() {
    try {
      await gitFetch(project.path, currentRemote || undefined);
      await refreshGitState();
      showToast("success", "获取成功", currentRemote ? `已获取 ${currentRemote}` : "已获取所有远程仓库");
    } catch (error) {
      console.error("Failed to fetch remote:", error);
      showToast("error", "获取失败", String(error));
    }
  }

  async function handleOpenProjectChat() {
    const providers = ensureAiDefaultProvider(aiProviders);
    const provider = providers.find((item) => item.enabled && item.isDefaultProvider) || providers.find((item) => item.enabled);
    const model = provider?.models.find((item) => item.enabled && item.isDefault) || provider?.models.find((item) => item.enabled);

    if (!provider || !model) {
      showToast("warning", "请先配置 AI 模型", "需要可用的供应商与模型后才能创建项目会话");
      setCurrentPage("aiProviders");
      return;
    }

    try {
      const session = await createChatSession({
        title: `${project.name} 对话`,
        providerId: provider.id,
        modelId: model.id,
      });
      const saved = await saveChatSession({
        ...session,
        allowedCwd: project.path,
      });
      navigateToChatSession(saved.id);
      showToast("success", "已创建项目会话", `目录已设置为 ${project.name}`);
    } catch (error) {
      console.error("Failed to create project chat:", error);
      showToast("error", "创建项目会话失败", String(error));
    }
  }

  async function handleSaveCategories() {
    try {
      const updated = await updateProject({
        id: project.id,
        tags: selectedCategories,
        labels: selectedLabels,
      });
      // 更新本地状态以立即反映变化
      setLocalProject(updated);
      onUpdate?.(updated);
      setShowCategoryModal(false);
      showToast("success", "保存成功", "项目分类和标签已更新");
    } catch (error) {
      console.error("Failed to update categories:", error);
      showToast("error", "保存失败", String(error));
    }
  }

  async function loadReadme() {
    try {
      const content = await invoke<string>("read_readme", { path: project.path });
      setReadmeContent(content);
      setShowReadme(true);
    } catch (error) {
      console.error("Failed to load README:", error);
      setReadmeContent("未找到 README.md 文件");
      setShowReadme(true);
    }
  }

  async function handleRemoveRemote(remoteName: string) {
    if (!confirm(`确定要删除远程仓库 "${remoteName}" 吗？`)) {
      return;
    }
    try {
      await removeRemote(project.path, remoteName);
      await loadProjectDetails();
      showToast("success", "删除成功", `远程仓库 ${remoteName} 已删除`);
    } catch (error) {
      console.error("Failed to remove remote:", error);
      showToast("error", "删除失败", String(error));
    }
  }

  return (
    <div className="project-detail-panel">
      {/* Header - 完全按照 example-projectPanel.html */}
      <header className="project-detail-header" data-tauri-drag-region>
        <div className="flex items-center gap-md">
          {/* 项目图标 */}
          <div className="project-icon">
            <GitBranch className="text-white" size={20} />
          </div>

          <div className="flex flex-col gap-xs">
            <div className="flex items-center gap-md">
              {/* 项目名称 */}
              <h1 className="font-bold text-gray-900 text-base tracking-tight">{localProject.name}</h1>

              {/* 分类标签区域 - 分类和标签分开显示，限制显示数量 */}
              <div className="flex items-center gap-md flex-wrap">
                {/* 分类 - 最多显示2个 */}
                {localProject.tags.length > 0 && (
                  <div className="flex items-center gap-sm">
                    <span className="text-xs text-gray-400">分类:</span>
                    {localProject.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="category-tag"
                      >
                        <span className="category-tag-dot"></span>
                        <span>{tag}</span>
                      </span>
                    ))}
                    {localProject.tags.length > 2 && (
                      <span
                        className="category-tag cursor-pointer"
                        title={localProject.tags.slice(2).join(", ")}
                        onClick={() => setShowCategoryModal(true)}
                      >
                        +{localProject.tags.length - 2}
                      </span>
                    )}
                  </div>
                )}

                {/* 分隔符 */}
                {localProject.tags.length > 0 && localProject.labels && localProject.labels.length > 0 && (
                  <span className="text-gray-300">|</span>
                )}

                {/* 技术栈标签 - 最多显示3个 */}
                {localProject.labels && localProject.labels.length > 0 && (
                  <div className="flex items-center gap-sm">
                    <span className="text-xs text-gray-400">标签:</span>
                    {localProject.labels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="label-tag"
                      >
                        {label}
                      </span>
                    ))}
                    {localProject.labels.length > 3 && (
                      <span
                        className="label-tag cursor-pointer"
                        title={localProject.labels.slice(3).join(", ")}
                        onClick={() => setShowCategoryModal(true)}
                      >
                        +{localProject.labels.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="edit-category-btn"
                >
                  <Edit2 size={10} className="opacity-70 group-hover:opacity-100" />
                  <span>{localProject.tags.length > 0 || (localProject.labels && localProject.labels.length > 0) ? "编辑" : "设置分类"}</span>
                </button>
              </div>
            </div>

            {/* 项目路径 */}
            <div className="flex items-center gap-xs">
              <p
                className="project-path cursor-pointer hover:text-blue-600 transition-colors"
                title="点击复制路径"
                onClick={() => {
                  navigator.clipboard.writeText(localProject.path);
                  showToast("success", "已复制", "路径已复制到剪贴板");
                }}
              >
                <FolderOpen size={12} className="text-gray-400" />
                {localProject.path}
                <Copy size={11} className="text-gray-400 ml-1" />
              </p>
              {/^[A-Za-z]:[\\/]/.test(localProject.path) && (
                <button
                  className="text-xs text-gray-400 hover:text-blue-600 transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50 whitespace-nowrap"
                  title="复制 WSL 路径"
                  onClick={() => {
                    const wslPath = localProject.path
                      .replace(/^([A-Za-z]):/, (_m, drive: string) => `/mnt/${drive.toLowerCase()}`)
                      .replace(/\\/g, "/");
                    navigator.clipboard.writeText(wslPath);
                    showToast("success", "已复制", `WSL 路径: ${wslPath}`);
                  }}
                >
                  WSL
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 操作按钮组 */}
        <div className="flex items-center gap-sm">
          {/* 提交按钮 - 只在有未提交修改时高亮 */}
          <button
            onClick={() => setShowCommitModal(true)}
            className={`action-btn ${gitStatus && !gitStatus.isClean ? 'action-btn-warning' : 'action-btn-secondary'}`}
          >
            <GitCommit size={14} />
            <span>提交</span>
          </button>
          <button
            onClick={handlePull}
            disabled={pulling || pushing}
            className={`action-btn action-btn-secondary ${pulling ? 'opacity-70' : ''}`}
          >
            {pulling ? (
              <Loader2 size={14} className="text-gray-600 animate-spin" />
            ) : (
              <RefreshCw size={14} className="text-gray-600" />
            )}
            <span>{pulling ? '拉取中...' : '拉取'}</span>
          </button>
          <button
            onClick={handlePush}
            disabled={pulling || pushing}
            className={`action-btn action-btn-primary ${pushing ? 'opacity-70' : ''}`}
          >
            {pushing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CloudUpload size={14} />
            )}
            <span>{pushing ? '推送中...' : '推送'}</span>
          </button>
          <div className="divider-vertical"></div>
          <button
            onClick={onClose}
            className="icon-btn"
            title="关闭面板"
          >
            <X size={16} />
          </button>
          {/* 窗口控制按钮 */}
          <div className="flex items-center ml-1 border-l border-gray-200 pl-2 gap-1">
            <button
              onClick={handleToggleMaximize}
              className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-600"
              title={isMaximized ? "还原" : "最大化"}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={handleMinimize}
              className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-600"
              title="最小化"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => getCurrentWindow()?.close()}
              className="w-7 h-7 flex items-center justify-center hover:bg-red-500 hover:text-white rounded-md transition-colors text-gray-400"
              title="关闭窗口"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* 主体内容 */}
      <div className="flex flex-1 pt-[4.5rem]">
        {/* Sidebar */}
        <aside className="project-detail-sidebar">
          <GitSidebar
            gitStatus={gitStatus}
            remotes={remotes}
            currentRemote={currentRemote}
            onOpenBranchModal={() => setShowBranchModal(true)}
            onAddRemote={() => setShowAddRemoteModal(true)}
            onOpenSyncModal={() => setShowSyncModal(true)}
            onSelectRemote={(remoteName) => {
              setCurrentRemote(remoteName);
              showToast("success", "切换成功", `已切换到远程仓库 ${remoteName}`);
            }}
            onRemoveRemote={handleRemoveRemote}
            onFetchRemote={handleFetchRemote}
            onStageFiles={handleStageFiles}
            onUnstageFiles={handleUnstageFiles}
            onDiscardFiles={handleDiscardFiles}
            onStashPush={handleStashPush}
            onStashPop={handleStashPop}
          />

          {/* 快捷操作 - 固定在侧边栏底部 */}
          <div className="sidebar-section-bottom">
            <div className="quick-actions-title">快捷操作</div>
            <div className="quick-actions-grid">
              <button
                onClick={loadReadme}
                className="quick-action-btn-compact"
                title="查看 README"
              >
                <FileText size={14} />
                <span>README</span>
              </button>
              <button
                onClick={() => {
                  const editorPath = getEditorForProject(storeProject, editors);
                  openInEditor(project.path, editorPath);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShowEditorMenu({ x: e.clientX, y: e.clientY });
                }}
                className="quick-action-btn-compact"
                title={(() => {
                  const ed = getEditorConfigForProject(storeProject, editors);
                  return ed ? `用 ${ed.name} 打开（右键选择）` : "在编辑器中打开（右键选择编辑器）";
                })()}
              >
                <span className="editor-icon-text" style={{ fontSize: 10, width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {(() => {
                    const ed = getEditorConfigForProject(storeProject, editors);
                    return ed ? getEditorIcon(ed.name) : "Ed";
                  })()}
                </span>
                <span>{(() => {
                  const ed = getEditorConfigForProject(storeProject, editors);
                  return ed ? ed.name : "编辑器";
                })()}</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await openInExplorer(project.path);
                  } catch (error) {
                    console.error("Failed to open explorer:", error);
                    showToast("error", "打开文件夹失败", String(error));
                  }
                }}
                className="quick-action-btn-compact"
                title="打开文件夹"
              >
                <FolderOpen size={14} />
                <span>文件夹</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    const termType = terminalConfig.type === "default" ? undefined : terminalConfig.type;
                    const termPath = terminalConfig.paths?.[terminalConfig.type as keyof typeof terminalConfig.paths];
                    await openInTerminal(project.path, termType, terminalConfig.customPath, termPath);
                  } catch (error) {
                    console.error("Failed to open terminal:", error);
                    showToast("error", "打开终端失败", String(error));
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShowTerminalMenu({ x: e.clientX, y: e.clientY });
                }}
                className="quick-action-btn-compact"
                title="终端（右键打开 Claude Code）"
              >
                <Terminal size={14} />
                <span>终端</span>
              </button>
              <button
                onClick={() => navigateToDockerTool(project.path, project.name)}
                className="quick-action-btn-compact"
                title="Docker 镜像"
              >
                <Box size={14} />
                <span>Docker</span>
              </button>
              <button
                onClick={handleOpenProjectChat}
                className="quick-action-btn-compact"
                title="新建项目 AI 对话"
              >
                <MessageSquare size={14} />
                <span>对话</span>
              </button>
            </div>
          </div>
        </aside>

        <CommitHistoryPanel
          projectPath={project.path}
          commits={commits}
          remotes={remotes}
          gitStatus={gitStatus}
          currentRemote={currentRemote}
          loading={loading}
          expandedCommit={expandedCommit}
          copiedHash={copiedHash}
          searchQuery={searchQuery}
          historyLimit={historyLimit}
          onRefresh={loadProjectDetails}
          onSearchChange={setSearchQuery}
          onLoadMore={() => setHistoryLimit((limit) => limit + 20)}
          onToggleCommit={(hash) => setExpandedCommit(expandedCommit === hash ? null : hash)}
          onCopyHash={copyHash}
        />
      </div>

      {/* 快速切换页脚 */}
      {recentProjects.length > 0 && onSwitchProject && (
        <footer className="panel-footer">
          <div className="panel-footer-label">
            <ArrowRightLeft size={12} />
            <span>快速切换</span>
          </div>
          <div className="panel-footer-projects">
            {recentProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => onSwitchProject(p)}
                className="footer-project-btn"
                title={p.path}
              >
                <GitBranch size={12} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </footer>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content animate-scale-in max-w-2xl">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">项目分类与标签</h3>
                <p className="modal-subtitle">为项目设置分类和技术栈标签</p>
              </div>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="modal-close-btn"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body space-y-lg">
              <CategorySelector selectedCategories={selectedCategories} onChange={setSelectedCategories} multiple={true} />
              <div className="border-t border-gray-200 pt-lg">
                <LabelSelector selectedLabels={selectedLabels} onChange={setSelectedLabels} multiple={true} />
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="modal-btn modal-btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleSaveCategories}
                className="modal-btn modal-btn-primary"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* README Modal */}
      {showReadme && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content animate-scale-in max-w-4xl">
            <div className="modal-header">
              <div className="flex items-center gap-sm">
                <FileText size={20} className="text-blue-600" />
                <h3 className="modal-title">README.md</h3>
              </div>
              <button
                onClick={() => setShowReadme(false)}
                className="modal-close-btn"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <MarkdownRenderer content={readmeContent} basePath={project.path} />
            </div>
          </div>
        </div>
      )}

      {/* Sync Remote Modal */}
      {showSyncModal && remotes.length > 0 && currentRemote && (
        <SyncRemoteModal
          projectPath={project.path}
          remotes={remotes}
          sourceRemote={currentRemote}
          onClose={() => setShowSyncModal(false)}
          onSuccess={() => {
            loadProjectDetails();
            markProjectDirty(project.path);
          }}
        />
      )}

      {/* Branch Switch Modal */}
      {showBranchModal && gitStatus && (
        <BranchSwitchModal
          projectPath={project.path}
          currentBranch={gitStatus.branch}
          onClose={() => setShowBranchModal(false)}
          onBranchChange={loadProjectDetails}
        />
      )}

      {/* Git Commit Modal */}
      {showCommitModal && (
        <GitCommitModal
          projectPath={project.path}
          currentRemote={currentRemote}
          currentBranch={gitStatus?.branch}
          onClose={() => setShowCommitModal(false)}
          onSuccess={() => {
            loadProjectDetails();
            markProjectDirty(project.path);
          }}
        />
      )}

      {/* Add Remote Modal */}
      {showAddRemoteModal && (
        <AddRemoteModal
          projectPath={project.path}
          onClose={() => setShowAddRemoteModal(false)}
          onSuccess={loadProjectDetails}
        />
      )}

      {/* Editor Context Menu */}
      {showEditorMenu && (
        <EditorContextMenu
          project={storeProject}
          position={showEditorMenu}
          onClose={() => setShowEditorMenu(null)}
        />
      )}

      {/* Terminal Context Menu (includes Claude Code) */}
      {showTerminalMenu && (
        <TerminalContextMenu
          project={storeProject}
          position={showTerminalMenu}
          onClose={() => setShowTerminalMenu(null)}
        />
      )}
    </div>
  );
}
