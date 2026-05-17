// 项目详情面板侧边栏底部的快捷操作面板。
// 包含 README / 编辑器 / 文件夹 / 终端 / Docker / 对话 六个按钮。
// 编辑器和终端按钮支持右键弹出二级菜单，菜单状态由 parent 持有以便 portal 渲染。

import { FileText, FolderOpen, Terminal, Box, MessageSquare } from "lucide-react";
import { useEditorsStore } from "@/stores/editorsStore";
import { useUiStore } from "@/stores/uiStore";
import { showToast } from "@/components/ui";
import { openInEditor, openInExplorer, openInTerminal } from "@/services/db";
import { getEditorForProject, getEditorConfigForProject, getEditorIcon } from "@/utils/editor";
import type { Project } from "@/types";

interface Props {
  project: Project;
  /** 来自 store 的最新项目数据（编辑器/Claude env 切换后立即刷新） */
  storeProject: Project;
  onLoadReadme: () => void;
  onOpenProjectChat: () => void;
  onShowEditorMenu: (pos: { x: number; y: number }) => void;
  onShowTerminalMenu: (pos: { x: number; y: number }) => void;
}

export function ProjectQuickActions({
  project,
  storeProject,
  onLoadReadme,
  onOpenProjectChat,
  onShowEditorMenu,
  onShowTerminalMenu,
}: Props) {
  const editors = useEditorsStore((s) => s.editors);
  const terminalConfig = useEditorsStore((s) => s.terminalConfig);
  const navigateToDockerTool = useUiStore((s) => s.navigateToDockerTool);

  const editorConfig = getEditorConfigForProject(storeProject, editors);
  const editorLabel = editorConfig?.name ?? "编辑器";
  const editorIcon = editorConfig ? getEditorIcon(editorConfig.name) : "Ed";
  const editorTitle = editorConfig
    ? `用 ${editorConfig.name} 打开（右键选择）`
    : "在编辑器中打开（右键选择编辑器）";

  return (
    <div className="sidebar-section-bottom">
      <div className="quick-actions-title">快捷操作</div>
      <div className="quick-actions-grid">
        <button onClick={onLoadReadme} className="quick-action-btn-compact" title="查看 README">
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
            onShowEditorMenu({ x: e.clientX, y: e.clientY });
          }}
          className="quick-action-btn-compact"
          title={editorTitle}
        >
          <span
            className="editor-icon-text"
            style={{
              fontSize: 10,
              width: 14,
              height: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {editorIcon}
          </span>
          <span>{editorLabel}</span>
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
              const termType =
                terminalConfig.type === "default" ? undefined : terminalConfig.type;
              const termPath =
                terminalConfig.paths?.[terminalConfig.type as keyof typeof terminalConfig.paths];
              await openInTerminal(project.path, termType, terminalConfig.customPath, termPath);
            } catch (error) {
              console.error("Failed to open terminal:", error);
              showToast("error", "打开终端失败", String(error));
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onShowTerminalMenu({ x: e.clientX, y: e.clientY });
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
          onClick={onOpenProjectChat}
          className="quick-action-btn-compact"
          title="新建项目 AI 对话"
        >
          <MessageSquare size={14} />
          <span>对话</span>
        </button>
      </div>
    </div>
  );
}
