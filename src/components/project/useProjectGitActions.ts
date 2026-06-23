// 项目详情面板里所有 git 操作 handler 的集合。
//
// 抽出来后 ProjectDetailPanel 只关心装配，不需要再写 19 个 handle* 函数。
// pulling/pushing 是异步状态，需要在 UI 上显示按钮 loading 态，所以一起留在 hook 里。

import { useState } from "react";
import { showToast } from "@/components/ui";
import { useProjectsStore } from "@/stores/projectsStore";
import {
  gitPull,
  gitPush,
  gitAdd,
  gitUnstage,
  gitDiscardFiles,
  gitFetch,
  gitRevertCommit,
  gitCherryPick,
  getConflictFileContent,
  gitCheckoutConflictVersion,
  gitMarkResolved,
  removeRemote,
  type ConflictFileContent,
} from "@/services/git";
import type { CommitInfo, GitStatus } from "@/types";

interface Params {
  projectPath: string;
  gitStatus: GitStatus | null;
  currentRemote: string | null;
  refresh: () => Promise<void>;
  setConflictPreview: (content: ConflictFileContent | null) => void;
}

export function useProjectGitActions({
  projectPath,
  gitStatus,
  currentRemote,
  refresh,
  setConflictPreview,
}: Params) {
  const markProjectDirty = useProjectsStore((s) => s.markProjectDirty);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  async function refreshAndMark() {
    await refresh();
    markProjectDirty(projectPath);
  }

  async function handlePull() {
    if (!gitStatus || !currentRemote || pulling) return;
    try {
      setPulling(true);
      await gitPull(projectPath, currentRemote, gitStatus.branch);
      await refreshAndMark();
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
      await gitPush(projectPath, currentRemote, gitStatus.branch);
      await refreshAndMark();
      showToast("success", "推送成功", `已推送到 ${currentRemote}/${gitStatus.branch}`);
    } catch (error) {
      console.error("Failed to push:", error);
      showToast("error", "推送失败", String(error));
    } finally {
      setPushing(false);
    }
  }

  async function handleStageFiles(files: string[]) {
    const label = files.length === 1 ? files[0] : `${files.length} 个文件`;
    if (!confirm(`确认执行 git add 吗？\n\n目标：${label}\n\n说明：git add 会把文件加入暂存区，表示这些改动准备进入下一次 commit。不会创建提交，也不会推送到远程。`)) return;
    try {
      await gitAdd(projectPath, files);
      await refreshAndMark();
      showToast("success", "已暂存", label);
    } catch (error) {
      console.error("Failed to stage files:", error);
      showToast("error", "暂存失败", String(error));
    }
  }

  async function handleUnstageFiles(files: string[]) {
    const label = files.length === 1 ? files[0] : `${files.length} 个文件`;
    if (!confirm(`确认执行 git restore --staged 吗？\n\n目标：${label}\n\n说明：这会把文件从暂存区移回工作区。文件内容不会丢，只是不再进入下一次 commit。`)) return;
    try {
      await gitUnstage(projectPath, files);
      await refreshAndMark();
      showToast("success", "已取消暂存", label);
    } catch (error) {
      console.error("Failed to unstage files:", error);
      showToast("error", "取消暂存失败", String(error));
    }
  }

  async function handleDiscardFiles(files: string[], includeUntracked: boolean) {
    const label = files.length === 1 ? files[0] : `${files.length} 个文件`;
    if (!confirm(`确认执行 git restore / git clean 吗？\n\n目标：${label}\n\n说明：这会丢弃本地未提交改动。已跟踪文件会恢复到 Git 记录中的版本；未跟踪文件会被删除。这个操作通常无法撤销。`)) return;
    try {
      await gitDiscardFiles(projectPath, files, includeUntracked);
      await refreshAndMark();
      showToast("success", "已丢弃变更", label);
    } catch (error) {
      console.error("Failed to discard files:", error);
      showToast("error", "丢弃失败", String(error));
    }
  }

  async function handleFetchRemote() {
    if (!confirm(`确认执行 git fetch 吗？\n\n说明：git fetch 只更新远程分支信息，不会修改当前工作区文件，也不会合并代码。`)) return;
    try {
      await gitFetch(projectPath, currentRemote || undefined);
      await refreshAndMark();
      showToast("success", "git fetch 完成", currentRemote ? `已 fetch ${currentRemote}` : "已 fetch 所有远程仓库");
    } catch (error) {
      console.error("Failed to fetch remote:", error);
      showToast("error", "git fetch 失败", String(error));
    }
  }

  async function handleCopyCommitMessage(message: string) {
    await navigator.clipboard.writeText(message);
    showToast("success", "已复制", "提交说明已复制到剪贴板");
  }

  async function handleRevertCommit(commit: CommitInfo) {
    if (!confirm(`确认执行 git revert 吗？\n\n提交：${commit.shortHash} ${commit.message}\n\n说明：git revert 会新增一个反向提交，用来撤销这个提交造成的改动。它不会删除历史；如果有冲突，需要手动解决。`)) return;
    try {
      await gitRevertCommit(projectPath, commit.hash);
      await refreshAndMark();
      showToast("success", "git revert 完成", commit.shortHash);
    } catch (error) {
      showToast("error", "git revert 失败", String(error));
    }
  }

  async function handleCherryPickCommit(commit: CommitInfo) {
    if (!confirm(`确认执行 git cherry-pick 吗？\n\n提交：${commit.shortHash} ${commit.message}\n\n说明：git cherry-pick 会把这个提交的改动复制到当前分支，并生成一个新提交。如果有冲突，需要手动解决。`)) return;
    try {
      await gitCherryPick(projectPath, commit.hash);
      await refreshAndMark();
      showToast("success", "git cherry-pick 完成", commit.shortHash);
    } catch (error) {
      showToast("error", "git cherry-pick 失败", String(error));
    }
  }

  async function handlePreviewConflict(file: string) {
    try {
      const content = await getConflictFileContent(projectPath, file);
      setConflictPreview(content);
    } catch (error) {
      showToast("error", "读取冲突失败", String(error));
    }
  }

  async function handleUseConflictVersion(file: string, version: "ours" | "theirs") {
    const label = version === "ours" ? "当前分支版本" : "传入分支版本";
    if (!confirm(`确认执行 git checkout --${version} 吗？\n\n文件：${file}\n采用：${label}\n\n说明：这个文件会直接使用${label}，另一边的改动会被丢弃。随后会执行 git add，把该文件标记为冲突已解决。`)) return;
    try {
      await gitCheckoutConflictVersion(projectPath, file, version);
      setConflictPreview(null);
      await refreshAndMark();
      showToast("success", "冲突已处理", `已采用${label}`);
    } catch (error) {
      showToast("error", "处理冲突失败", String(error));
    }
  }

  async function handleMarkResolved(file: string) {
    if (!confirm(`确认执行 git add 标记冲突已解决吗？\n\n文件：${file}\n\n说明：只有当你已经手动编辑好冲突内容后才点这个。Git 会把当前文件内容加入暂存区，表示冲突已处理。`)) return;
    try {
      await gitMarkResolved(projectPath, file);
      setConflictPreview(null);
      await refreshAndMark();
      showToast("success", "已标记解决", file);
    } catch (error) {
      showToast("error", "标记解决失败", String(error));
    }
  }

  async function handleRemoveRemote(remoteName: string) {
    if (!confirm(`确定要删除远程仓库 "${remoteName}" 吗？`)) return;
    try {
      await removeRemote(projectPath, remoteName);
      await refresh();
      showToast("success", "删除成功", `远程仓库 ${remoteName} 已删除`);
    } catch (error) {
      console.error("Failed to remove remote:", error);
      showToast("error", "删除失败", String(error));
    }
  }

  return {
    pulling,
    pushing,
    handlePull,
    handlePush,
    handleStageFiles,
    handleUnstageFiles,
    handleDiscardFiles,
    handleFetchRemote,
    handleCopyCommitMessage,
    handleRevertCommit,
    handleCherryPickCommit,
    handlePreviewConflict,
    handleUseConflictVersion,
    handleMarkResolved,
    handleRemoveRemote,
  };
}
