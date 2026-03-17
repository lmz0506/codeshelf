import { useState, useEffect, useRef } from "react";
import type { ClaudeCodeInfo } from "@/types/toolbox";
import type { Project } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { launchClaudeInTerminal, getClaudeInstallationsCache } from "@/services/toolbox";
import { showToast } from "@/components/ui";

interface ClaudeEnvSelectorProps {
  project: Project;
  position: { x: number; y: number };
  onClose: () => void;
}

export function ClaudeEnvSelector({ project, position, onClose }: ClaudeEnvSelectorProps) {
  const { terminalConfig, setProjectClaudeEnv } = useAppStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const [envs, setEnvs] = useState<ClaudeCodeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClaudeInstallationsCache()
      .then((cached) => {
        setEnvs(cached?.filter((e) => e.installed) || []);
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
  }, [position, envs]);

  // ESC 关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSelect(env: ClaudeCodeInfo) {
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

  function handleSetDefault(envName: string) {
    setProjectClaudeEnv(project.id, envName);
    showToast("success", "已设置", `「${project.name}」默认 Claude 环境已设为 ${envName}`);
    onClose();
  }

  function handleClearDefault() {
    setProjectClaudeEnv(project.id, null);
    showToast("success", "已清除", `「${project.name}」将自动选择 Claude 环境`);
    onClose();
  }

  const hasProjectDefault = !!project.claudeEnvName;

  return (
    <div
      ref={menuRef}
      className="editor-context-menu"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      <div className="editor-context-menu-header">选择 Claude Code 环境</div>
      {loading ? (
        <div className="editor-context-menu-empty">加载中...</div>
      ) : envs.length === 0 ? (
        <div className="editor-context-menu-empty">未检测到已安装的 Claude Code</div>
      ) : (
        envs.map((env, i) => {
          const isDefault = project.claudeEnvName === env.envName;
          return (
            <div key={i} className="editor-context-menu-item-row">
              <button
                className={`editor-context-menu-item ${isDefault ? "editor-context-menu-item-active" : ""}`}
                onClick={() => handleSelect(env)}
                title={env.version ? `v${env.version}` : undefined}
              >
                <span className="claude-icon-text" style={{ fontSize: 11, width: 20, height: 20, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>C</span>
                <span className="editor-context-menu-item-name">{env.envName}</span>
                {isDefault && (
                  <span className="editor-context-menu-badge">项目默认</span>
                )}
                {env.version && (
                  <span className="editor-context-menu-badge-global">v{env.version}</span>
                )}
              </button>
              {!isDefault && (
                <button
                  className="editor-context-menu-set-default"
                  onClick={() => handleSetDefault(env.envName)}
                  title="设为此项目默认 Claude 环境"
                >
                  设为默认
                </button>
              )}
            </div>
          );
        })
      )}
      {hasProjectDefault && (
        <>
          <div className="editor-context-menu-divider" />
          <button
            className="editor-context-menu-item editor-context-menu-item-clear"
            onClick={handleClearDefault}
          >
            自动选择环境
          </button>
        </>
      )}
    </div>
  );
}
