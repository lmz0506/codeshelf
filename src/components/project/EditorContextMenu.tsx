import { useState, useEffect, useRef } from "react";
import type { Project } from "@/types";
import type { EditorConfig } from "@/stores/appStore";
import { useAppStore } from "@/stores/appStore";
import { openInEditor } from "@/services/db";
import { getEditorForProject } from "@/utils/editor";

interface EditorContextMenuProps {
  project: Project;
  position: { x: number; y: number };
  onClose: () => void;
}

export function EditorContextMenu({ project, position, onClose }: EditorContextMenuProps) {
  const { editors, setProjectEditor } = useAppStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // 调整位置避免溢出
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const x = position.x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : position.x;
      const y = position.y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : position.y;
      setAdjustedPos({ x, y });
    }
  }, [position]);

  // ESC 关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleOpenWith(editor: EditorConfig) {
    try {
      await openInEditor(project.path, editor.path);
      onClose();
    } catch (error) {
      console.error("Failed to open editor:", error);
      alert("打开编辑器失败：" + error);
    }
  }

  function handleSetDefault(editorId: string) {
    setProjectEditor(project.id, editorId);
    onClose();
  }

  function handleClearDefault() {
    setProjectEditor(project.id, null);
    onClose();
  }

  const currentEditorPath = getEditorForProject(project, editors);
  const hasProjectDefault = !!project.editorId && editors.some((e) => e.id === project.editorId);

  if (editors.length === 0) {
    return (
      <div
        ref={menuRef}
        className="editor-context-menu"
        style={{ left: adjustedPos.x, top: adjustedPos.y }}
      >
        <div className="editor-context-menu-empty">
          暂无编辑器配置，请在设置中添加
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="editor-context-menu"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      <div className="editor-context-menu-header">选择编辑器</div>
      {editors.map((editor) => {
        const isCurrentDefault = editor.path === currentEditorPath;
        const isProjectDefault = project.editorId === editor.id;
        return (
          <div key={editor.id} className="editor-context-menu-item-row">
            <button
              className={`editor-context-menu-item ${isCurrentDefault ? "editor-context-menu-item-active" : ""}`}
              onClick={() => handleOpenWith(editor)}
              title={`用 ${editor.name} 打开`}
            >
              <span className="editor-context-menu-item-name">{editor.name}</span>
              {isProjectDefault && (
                <span className="editor-context-menu-badge">项目默认</span>
              )}
              {!isProjectDefault && isCurrentDefault && (
                <span className="editor-context-menu-badge-global">全局默认</span>
              )}
            </button>
            {!isProjectDefault && (
              <button
                className="editor-context-menu-set-default"
                onClick={() => handleSetDefault(editor.id)}
                title="设为此项目默认编辑器"
              >
                设为默认
              </button>
            )}
          </div>
        );
      })}
      {hasProjectDefault && (
        <>
          <div className="editor-context-menu-divider" />
          <button
            className="editor-context-menu-item editor-context-menu-item-clear"
            onClick={handleClearDefault}
          >
            使用全局默认
          </button>
        </>
      )}
    </div>
  );
}
