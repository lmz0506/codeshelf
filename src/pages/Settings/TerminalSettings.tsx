import { useState } from "react";
import { FolderOpen, AlertCircle, Check, Monitor, Command, Apple, Settings } from "lucide-react";
import { useAppStore, TerminalConfig } from "@/stores/appStore";
import { open } from "@tauri-apps/plugin-dialog";

interface TerminalSettingsProps {
  onClose?: () => void;
}

export function TerminalSettings({ onClose }: TerminalSettingsProps) {
  const { terminalConfig, setTerminalConfig } = useAppStore();
  const [customPath, setCustomPath] = useState(terminalConfig.customPath || "");

  async function handleBrowsePath() {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: "选择终端可执行文件",
      });

      if (selected) {
        setCustomPath(selected as string);
      }
    } catch (error) {
      console.error("Failed to select file:", error);
    }
  }

  function handleTypeChange(type: TerminalConfig["type"]) {
    setTerminalConfig({ type, customPath: type === "custom" ? customPath : undefined });
  }

  function handleSaveCustomPath() {
    if (customPath.trim()) {
      setTerminalConfig({ type: "custom", customPath: customPath.trim() });
    }
  }

  const terminalOptions = [
    {
      group: "Windows",
      options: [
        { value: "default" as const, label: "系统默认", description: "Windows Terminal / PowerShell", icon: Monitor },
        { value: "powershell" as const, label: "PowerShell", description: "Windows PowerShell", icon: Command },
        { value: "cmd" as const, label: "CMD", description: "命令提示符", icon: Monitor },
      ],
    },
    {
      group: "macOS",
      options: [
        { value: "terminal" as const, label: "Terminal", description: "系统自带终端", icon: Apple },
        { value: "iterm" as const, label: "iTerm2", description: "需已安装 iTerm2", icon: Command },
      ],
    },
    {
      group: "自定义",
      options: [
        { value: "custom" as const, label: "自定义", description: "指定终端程序路径", icon: Settings },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <h4 className="text-sm font-semibold text-[var(--text)]">选择终端类型</h4>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-light)] hover:text-[var(--primary)] transition-colors"
          >
            收起
          </button>
        )}
      </div>

      {/* 说明文档 */}
      <div className="p-3 bg-blue-50/50 border border-blue-200/50 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            选择您偏好的终端程序，用于在项目目录中打开命令行。
          </div>
        </div>
      </div>

      {/* 终端类型选择 */}
      <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
        {terminalOptions.map((group) => (
          <div key={group.group} className="space-y-2">
            <p className="text-xs font-semibold text-[var(--text-light)] uppercase tracking-wider">
              {group.group}
            </p>
            <div className="space-y-2">
              {group.options.map((option) => {
                const isSelected = option.value === terminalConfig.type;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleTypeChange(option.value)}
                    className={`w-full flex items-center gap-3 p-3 border rounded-lg transition-all text-left ${
                      isSelected
                        ? "border-[var(--primary)] bg-[var(--primary-light)]"
                        : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--bg-light)]"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-[var(--primary)] text-white" : "bg-[var(--bg-light)] text-[var(--text-light)]"
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-medium ${
                          isSelected ? "text-[var(--primary)]" : "text-[var(--text)]"
                        }`}
                      >
                        {option.label}
                      </div>
                      <div className="text-xs text-[var(--text-light)] truncate">{option.description}</div>
                    </div>
                    {isSelected && <Check size={16} className="text-[var(--primary)] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 自定义路径输入 */}
      {terminalConfig.type === "custom" && (
        <div className="p-4 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg space-y-3">
          <label className="block text-xs font-medium text-[var(--text)]">
            自定义终端路径
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="选择或输入终端可执行文件路径"
              className="flex-1 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
            />
            <button
              onClick={handleBrowsePath}
              className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-lg text-sm hover:bg-[var(--border)] transition-colors flex items-center gap-1.5"
            >
              <FolderOpen size={14} />
              浏览
            </button>
          </div>
          <button
            onClick={handleSaveCustomPath}
            disabled={!customPath.trim()}
            className="w-full py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Check size={14} />
            保存路径
          </button>
        </div>
      )}
    </div>
  );
}
