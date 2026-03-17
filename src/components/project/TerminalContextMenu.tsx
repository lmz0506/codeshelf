import { useState, useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import type { Project } from "@/types";
import type { ClaudeCodeInfo } from "@/types/toolbox";
import { useAppStore } from "@/stores/appStore";
import { openInTerminal } from "@/services/db";
import { launchClaudeInTerminal, getClaudeInstallationsCache } from "@/services/toolbox";
import { showToast } from "@/components/ui";

interface TerminalContextMenuProps {
  project: Project;
  position: { x: number; y: number };
  onClose: () => void;
}

export function TerminalContextMenu({ project, position, onClose }: TerminalContextMenuProps) {
  const { terminalConfig, setProjectClaudeEnv } = useAppStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const [claudeEnvs, setClaudeEnvs] = useState<ClaudeCodeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClaudeInstallationsCache()
      .then((cached) => {
        // 只显示有版本号的可用环境
        setClaudeEnvs(cached?.filter((e) => e.installed && e.version) || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
  }, [position, claudeEnvs]);

  // ESC 关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleOpenTerminal() {
    try {
      const termType = terminalConfig.type === "default" ? undefined : terminalConfig.type;
      const termPath = terminalConfig.paths?.[terminalConfig.type as keyof typeof terminalConfig.paths];
      await openInTerminal(project.path, termType, terminalConfig.customPath, termPath);
      onClose();
    } catch (error) {
      console.error("Failed to open terminal:", error);
      showToast("error", "打开终端失败", String(error));
    }
  }

  async function handleLaunchClaude(env: ClaudeCodeInfo) {
    try {
      const termType = terminalConfig.type === "default" ? undefined : terminalConfig.type;
      const termPath = terminalConfig.paths?.[terminalConfig.type as keyof typeof terminalConfig.paths];
      await launchClaudeInTerminal(project.path, termType, terminalConfig.customPath, termPath, env.envType, env.envName);
      showToast("success", "已启动", `Claude Code (${env.envName}) 已在终端中打开`);
      onClose();
    } catch (error) {
      console.error("Failed to launch Claude Code:", error);
      showToast("error", "启动失败", String(error));
    }
  }

  function handleSetDefaultClaude(envName: string) {
    setProjectClaudeEnv(project.id, envName);
    showToast("success", "已设置", `「${project.name}」默认 Claude 环境: ${envName}`);
  }

  function handleClearDefaultClaude() {
    setProjectClaudeEnv(project.id, null);
    showToast("success", "已清除", `「${project.name}」将自动选择 Claude 环境`);
  }

  return (
    <div
      ref={menuRef}
      className="editor-context-menu"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* 普通终端 */}
      <div className="editor-context-menu-header">终端</div>
      <button
        className="editor-context-menu-item"
        onClick={handleOpenTerminal}
      >
        <Terminal size={14} style={{ flexShrink: 0 }} />
        <span className="editor-context-menu-item-name">打开终端</span>
      </button>

      {/* Claude Code 环境 */}
      {!loading && claudeEnvs.length > 0 && (
        <>
          <div className="editor-context-menu-divider" />
          <div className="editor-context-menu-header">Claude Code</div>
          {claudeEnvs.map((env, i) => {
            const isDefault = project.claudeEnvName === env.envName;
            return (
              <div key={i} className="editor-context-menu-item-row">
                <button
                  className={`editor-context-menu-item ${isDefault ? "editor-context-menu-item-active" : ""}`}
                  onClick={() => handleLaunchClaude(env)}
                  title={`v${env.version}`}
                >
                  <span className="claude-icon-text" style={{ fontSize: 10, width: 18, height: 18, flexShrink: 0 }}>C</span>
                  <span className="editor-context-menu-item-name">{env.envName}</span>
                  {isDefault && (
                    <span className="editor-context-menu-badge">默认</span>
                  )}
                  <span className="editor-context-menu-badge-global">v{env.version}</span>
                </button>
                {!isDefault && (
                  <button
                    className="editor-context-menu-set-default"
                    onClick={() => handleSetDefaultClaude(env.envName)}
                    title="设为此项目默认 Claude 环境"
                  >
                    默认
                  </button>
                )}
              </div>
            );
          })}
          {project.claudeEnvName && (
            <button
              className="editor-context-menu-item editor-context-menu-item-clear"
              onClick={handleClearDefaultClaude}
            >
              清除默认环境
            </button>
          )}
        </>
      )}
    </div>
  );
}
