import { Check, FolderOpen, HelpCircle, Terminal, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui";
import type { ClaudeCodeInfo } from "@/types/toolbox";

interface FindClaudeHelpDialogProps {
  onClose: () => void;
}

export function FindClaudeHelpDialog({ onClose }: FindClaudeHelpDialogProps) {
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <HelpCircle size={20} className="text-blue-500" />
            如何查找 Claude Code
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 flex items-center gap-2">
              <span className="text-lg">🪟</span>
              <h4 className="font-medium text-gray-900 dark:text-white">Windows</h4>
            </div>
            <div className="p-3 space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-400">在命令提示符或 PowerShell 中运行：</p>
              <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">where claude</code>
              <p className="text-gray-500 text-xs mt-2">
                常见路径：
                <br />• <code className="text-xs">C:\Users\用户名\AppData\Roaming\npm\claude</code>
                <br />• <code className="text-xs">C:\Program Files\nodejs\claude</code>
                <br />• <code className="text-xs">~\AppData\Local\nvm\v版本号\claude</code>（使用 nvm）
              </p>
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 flex items-center gap-2">
              <span className="text-lg">🐧</span>
              <h4 className="font-medium text-gray-900 dark:text-white">WSL (Windows Subsystem for Linux)</h4>
            </div>
            <div className="p-3 space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-400">在 WSL 终端中运行：</p>
              <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">which claude</code>
              <p className="text-gray-500 text-xs mt-2">
                常见路径：
                <br />• <code className="text-xs">/usr/bin/claude</code>
                <br />• <code className="text-xs">/usr/local/bin/claude</code>
                <br />• <code className="text-xs">~/.nvm/versions/node/v版本号/bin/claude</code>（使用 nvm）
                <br />• <code className="text-xs">~/.local/bin/claude</code>
              </p>
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-700 dark:text-yellow-400">
                <strong>注意：</strong>WSL 路径需要手动输入 Linux 格式的路径（如 <code>/usr/bin/claude</code>），
                不支持通过文件选择器选择。点击"手动选择"后直接输入路径即可。
              </div>
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
              <span className="text-lg">🍎</span>
              <h4 className="font-medium text-gray-900 dark:text-white">macOS</h4>
            </div>
            <div className="p-3 space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-400">在终端中运行：</p>
              <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">which claude</code>
              <p className="text-gray-500 text-xs mt-2">
                常见路径：
                <br />• <code className="text-xs">/usr/local/bin/claude</code>
                <br />• <code className="text-xs">/opt/homebrew/bin/claude</code>（Homebrew）
                <br />• <code className="text-xs">~/.nvm/versions/node/v版本号/bin/claude</code>（使用 nvm）
              </p>
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 flex items-center gap-2">
              <span className="text-lg">🐧</span>
              <h4 className="font-medium text-gray-900 dark:text-white">Linux</h4>
            </div>
            <div className="p-3 space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-400">在终端中运行：</p>
              <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">which claude</code>
              <p className="text-gray-500 text-xs mt-2">
                常见路径：
                <br />• <code className="text-xs">/usr/bin/claude</code>
                <br />• <code className="text-xs">/usr/local/bin/claude</code>
                <br />• <code className="text-xs">~/.nvm/versions/node/v版本号/bin/claude</code>（使用 nvm）
                <br />• <code className="text-xs">~/.local/bin/claude</code>
              </p>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
            <p className="font-medium text-blue-700 dark:text-blue-400 mb-1">还没有安装 Claude Code？</p>
            <p className="text-blue-600 dark:text-blue-300 text-xs">运行以下命令安装：</p>
            <code className="block p-2 mt-1 bg-white dark:bg-gray-800 rounded text-xs font-mono text-gray-700 dark:text-gray-300">
              npm install -g @anthropic-ai/claude-code
            </code>
          </div>
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose} variant="secondary">关闭</Button>
        </div>
      </div>
    </div>
  );
}

interface EditConfigDirDialogProps {
  env: ClaudeCodeInfo;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EditConfigDirDialog({ env, value, onChange, onCancel, onConfirm }: EditConfigDirDialogProps) {
  const isWsl = env.envType === "wsl";
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
            <FolderOpen size={20} className="text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">设置配置目录</h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          为 <span className="font-medium">{env.envName}</span> 设置 Claude Code 配置文件所在的目录。
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              {isWsl ? "Linux 路径" : "配置目录路径"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={isWsl ? "~/.claude 或 /home/用户名/.claude" : "C:\\Users\\用户名\\.claude"}
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              {!isWsl && (
                <button
                  onClick={async () => {
                    try {
                      const selected = await open({
                        title: "选择配置目录",
                        directory: true,
                        multiple: false,
                      });
                      if (selected && typeof selected === "string") {
                        onChange(selected);
                      }
                    } catch (err) {
                      console.error("选择文件夹失败:", err);
                    }
                  }}
                  className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  title="选择文件夹"
                >
                  <FolderOpen size={16} className="text-gray-500" />
                </button>
              )}
            </div>
          </div>

          {isWsl && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs space-y-1">
              <p className="font-medium text-blue-700 dark:text-blue-400">提示</p>
              <p className="text-gray-600 dark:text-gray-400">
                在 WSL 终端运行 <code className="bg-white dark:bg-gray-800 px-1 rounded">echo $HOME/.claude</code> 获取路径
              </p>
              <p className="text-gray-500 mt-1">
                <strong>发行版：</strong> {env.envName.replace("WSL: ", "")}
              </p>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p className="font-medium mb-1">常见配置目录位置：</p>
            {isWsl ? (
              <ul className="list-disc list-inside space-y-0.5">
                <li><code>~/.claude</code></li>
                <li><code>/home/用户名/.claude</code></li>
              </ul>
            ) : (
              <ul className="list-disc list-inside space-y-0.5">
                <li>Windows: <code>C:\Users\用户名\.claude</code></li>
                <li>macOS/Linux: <code>~/.claude</code></li>
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="secondary">取消</Button>
          <Button onClick={onConfirm} variant="primary" disabled={!value.trim()}>
            <Check size={14} className="mr-1" />
            确定
          </Button>
        </div>
      </div>
    </div>
  );
}

interface WslClaudePathDialogProps {
  env: ClaudeCodeInfo;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function WslClaudePathDialog({ env, value, error, onChange, onCancel, onConfirm }: WslClaudePathDialogProps) {
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
            <Terminal size={18} className="text-orange-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">设置 WSL Claude Code 路径</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Linux 路径</label>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="/usr/bin/claude"
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                error ? "border-red-500" : "border-gray-200 dark:border-gray-700"
              }`}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs space-y-2">
            <p className="font-medium text-blue-700 dark:text-blue-400">如何获取路径？</p>
            <p className="text-gray-600 dark:text-gray-400">
              在 WSL 终端运行 <code className="bg-white dark:bg-gray-800 px-1 rounded">which claude</code>
            </p>
            <p className="text-gray-500 pt-2 border-t border-blue-200 dark:border-blue-800">常见路径：</p>
            <ul className="list-disc list-inside text-gray-500 space-y-0.5">
              <li><code>/usr/bin/claude</code></li>
              <li><code>/usr/local/bin/claude</code></li>
              <li><code>~/.nvm/versions/node/v版本号/bin/claude</code></li>
              <li><code>~/.local/bin/claude</code></li>
            </ul>
          </div>

          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs text-gray-500">
            <strong>发行版：</strong> {env.envName.replace("WSL: ", "")}
            <br />
            <span className="text-gray-400">路径将自动转换为 Windows 可访问格式</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <Button onClick={onCancel} variant="secondary">取消</Button>
          <Button onClick={onConfirm} variant="primary" disabled={!value.trim()}>
            <Check size={14} className="mr-1" />
            确定
          </Button>
        </div>
      </div>
    </div>
  );
}
