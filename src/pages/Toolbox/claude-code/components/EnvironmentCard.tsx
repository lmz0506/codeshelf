import { Check, CheckCircle, Copy, Edit3, HelpCircle, X } from "lucide-react";
import type { ClaudeCodeInfo } from "@/types/toolbox";

interface EnvironmentCardProps {
  installations: ClaudeCodeInfo[];
  selectedEnv: ClaudeCodeInfo;
  copiedText: string | null;
  onSelectEnv: (env: ClaudeCodeInfo) => void;
  onCopy: (text: string, label: string) => void;
  onSelectClaudePath: () => void;
  onOpenFindHelp: () => void;
  onEditConfigDir: (current: string) => void;
}

export function EnvironmentCard({
  installations,
  selectedEnv,
  copiedText,
  onSelectEnv,
  onCopy,
  onSelectClaudePath,
  onOpenFindHelp,
  onEditConfigDir,
}: EnvironmentCardProps) {
  return (
    <div className="re-card p-3 flex-shrink-0 space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
          环境:
          <button
            onClick={onOpenFindHelp}
            className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-blue-500"
            title="如何查找 Claude Code"
          >
            <HelpCircle size={14} />
          </button>
        </span>
        {installations.map((env) => (
          <button
            key={`${env.envType}-${env.envName}`}
            onClick={() => {
              if (selectedEnv?.envName === env.envName) return;
              onSelectEnv(env);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm ${
              selectedEnv?.envName === env.envName
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="font-medium">{env.envName}</span>
            {env.installed ? (
              <CheckCircle size={14} className="text-green-500" />
            ) : (
              <X size={14} className="text-red-400" />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm border-t border-gray-100 dark:border-gray-800 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 flex-shrink-0">版本:</span>
          {selectedEnv.version ? (
            <>
              <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{selectedEnv.version}</code>
              <button
                onClick={() => onCopy(selectedEnv.version!, "version")}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex-shrink-0"
                title="复制版本"
              >
                {copiedText === "version" ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-400" />}
              </button>
            </>
          ) : (
            <span className="text-gray-300">-</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 flex-shrink-0">路径:</span>
          {selectedEnv.path ? (
            <>
              <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs truncate flex-1" title={selectedEnv.path}>
                {selectedEnv.path}
              </code>
              <button
                onClick={() => onCopy(selectedEnv.path!, "path")}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex-shrink-0"
                title="复制路径"
              >
                {copiedText === "path" ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-400" />}
              </button>
              {selectedEnv.envType === "wsl" && (
                <button
                  onClick={onSelectClaudePath}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex-shrink-0"
                  title="重新设置路径"
                >
                  <Edit3 size={12} className="text-gray-400" />
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-gray-300">未检测到</span>
              <button
                onClick={onSelectClaudePath}
                className="text-xs text-blue-500 hover:underline"
              >
                手动选择
              </button>
              <button
                onClick={onOpenFindHelp}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                title="如何查找 Claude"
              >
                <HelpCircle size={14} className="text-gray-400" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 flex-shrink-0">配置目录:</span>
          {selectedEnv.configDir ? (
            <>
              <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs truncate flex-1" title={selectedEnv.configDir}>
                {selectedEnv.configDir}
              </code>
              <button
                onClick={() => onCopy(selectedEnv.configDir!, "configDir")}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex-shrink-0"
                title="复制配置目录"
              >
                {copiedText === "configDir" ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-400" />}
              </button>
              <button
                onClick={() => onEditConfigDir(selectedEnv.configDir || "")}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex-shrink-0"
                title="修改配置目录"
              >
                <Edit3 size={12} className="text-gray-400" />
              </button>
            </>
          ) : (
            <>
              <span className="text-gray-300">-</span>
              <button
                onClick={() => onEditConfigDir("")}
                className="text-xs text-blue-500 hover:underline"
              >
                设置
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
