import { ChevronDown, Edit3, FolderOpen, Play, Settings, Star } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

interface LaunchClaudeMenuProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  selectedConfigDir: string | null;
  launchDirs: string[];
  onLaunch: (dir?: string) => void;
  onShowManualInput: () => void;
  onShowManageDirs: () => void;
}

export function LaunchClaudeMenu({
  open: menuOpen,
  onToggle,
  onClose,
  selectedConfigDir,
  launchDirs,
  onLaunch,
  onShowManualInput,
  onShowManageDirs,
}: LaunchClaudeMenuProps) {
  return (
    <div className="relative">
      <button onClick={onToggle} className="re-btn flex items-center gap-2" title="启动 Claude Code">
        <Play size={16} />
        <span>启动 Claude</span>
        <ChevronDown size={14} />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-1 overflow-hidden">
            {selectedConfigDir && (
              <button
                onClick={() => onLaunch(selectedConfigDir)}
                className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
              >
                <Play size={14} className="text-green-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-gray-900 dark:text-white">在配置目录启动</div>
                  <div className="text-xs text-gray-500 truncate">{selectedConfigDir}</div>
                </div>
              </button>
            )}
            <button
              onClick={async () => {
                try {
                  const selected = await open({
                    title: "选择工作目录",
                    directory: true,
                    multiple: false,
                  });
                  if (selected && typeof selected === "string") {
                    onLaunch(selected);
                  }
                } catch (err) {
                  console.error("选择目录失败:", err);
                }
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
            >
              <FolderOpen size={14} className="text-blue-500 flex-shrink-0" />
              <span className="text-gray-900 dark:text-white">选择目录启动...</span>
            </button>
            <button
              onClick={onShowManualInput}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
            >
              <Edit3 size={14} className="text-purple-500 flex-shrink-0" />
              <span className="text-gray-900 dark:text-white">输入目录启动...</span>
            </button>
            {launchDirs.length > 0 && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                {launchDirs.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => onLaunch(dir)}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm group"
                  >
                    <Star size={14} className="text-yellow-500 flex-shrink-0" />
                    <span className="text-gray-900 dark:text-white truncate flex-1" title={dir}>{dir}</span>
                  </button>
                ))}
              </>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button
              onClick={onShowManageDirs}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
            >
              <Settings size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-600 dark:text-gray-400">管理常用目录...</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
