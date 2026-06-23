import { FolderOpen, Play, Plus, Star, Terminal, Trash2, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui";

interface ManageLaunchDirsDialogProps {
  launchDirs: string[];
  newDirInput: string;
  onNewDirInputChange: (v: string) => void;
  onAddDir: (dir: string) => void;
  onSelectFolder: () => void;
  onRemoveDir: (dir: string) => void;
  onClose: () => void;
}

export function ManageLaunchDirsDialog({
  launchDirs,
  newDirInput,
  onNewDirInputChange,
  onAddDir,
  onSelectFolder,
  onRemoveDir,
  onClose,
}: ManageLaunchDirsDialogProps) {
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Star size={20} className="text-yellow-500" />
            管理常用目录
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {launchDirs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无常用目录</p>
              <p className="text-xs mt-1">在下方输入路径或选择文件夹添加</p>
            </div>
          ) : (
            <div className="space-y-2">
              {launchDirs.map((dir) => (
                <div
                  key={dir}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 group"
                >
                  <Star size={14} className="text-yellow-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-white truncate flex-1 font-mono" title={dir}>
                    {dir}
                  </span>
                  <button
                    onClick={() => onRemoveDir(dir)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-opacity"
                    title="移除"
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newDirInput}
              onChange={(e) => onNewDirInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newDirInput.trim()) {
                  onAddDir(newDirInput);
                  onNewDirInputChange("");
                }
              }}
              placeholder="输入目录路径，如 /home/user/project"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <button
              onClick={onSelectFolder}
              className="px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="选择文件夹"
            >
              <FolderOpen size={16} className="text-gray-500" />
            </button>
            <Button
              onClick={() => {
                if (newDirInput.trim()) {
                  onAddDir(newDirInput);
                  onNewDirInputChange("");
                }
              }}
              variant="primary"
              disabled={!newDirInput.trim()}
            >
              <Plus size={14} className="mr-1" />
              添加
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose} variant="secondary">关闭</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ManualLaunchDialogProps {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onLaunch: (dir: string) => void;
}

export function ManualLaunchDialog({ value, onChange, onCancel, onLaunch }: ManualLaunchDialogProps) {
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
            <Terminal size={20} className="text-purple-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">输入目录启动 Claude</h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          输入工作目录路径，支持 Linux 路径（如 WSL）
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                onLaunch(value.trim());
              }
            }}
            placeholder="/home/user/project 或 C:\project"
            className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            autoFocus
          />
          <button
            onClick={async () => {
              try {
                const selected = await open({ title: "选择工作目录", directory: true, multiple: false });
                if (selected && typeof selected === "string") {
                  onChange(selected);
                }
              } catch (err) {
                console.error(err);
              }
            }}
            className="px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title="选择文件夹"
          >
            <FolderOpen size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="secondary">取消</Button>
          <Button
            onClick={() => {
              if (value.trim()) onLaunch(value.trim());
            }}
            variant="primary"
            disabled={!value.trim()}
          >
            <Play size={14} className="mr-1" />
            启动
          </Button>
        </div>
      </div>
    </div>
  );
}
