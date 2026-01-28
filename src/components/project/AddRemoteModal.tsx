import { useState } from "react";
import { X, Globe, Loader2 } from "lucide-react";
import { showToast } from "@/components/ui";
import { addRemote } from "@/services/git";

interface AddRemoteModalProps {
  projectPath: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddRemoteModal({ projectPath, onClose, onSuccess }: AddRemoteModalProps) {
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      showToast("error", "验证失败", "请输入远程仓库名称");
      return;
    }
    if (!url.trim()) {
      showToast("error", "验证失败", "请输入远程仓库地址");
      return;
    }

    try {
      setLoading(true);
      await addRemote(projectPath, name.trim(), url.trim());
      showToast("success", "添加成功", `远程仓库 ${name} 已添加`);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to add remote:", error);
      showToast("error", "添加失败", String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-content animate-scale-in max-w-lg">
        <div className="modal-header">
          <div className="flex items-center gap-sm">
            <Globe size={20} className="text-blue-600" />
            <div>
              <h3 className="modal-title">添加远程仓库</h3>
              <p className="modal-subtitle">配置远程 Git 仓库地址</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body space-y-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              远程仓库名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: origin, upstream"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              通常使用 "origin" 作为主仓库名称
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              仓库地址 (URL)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/username/repo.git"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              支持 HTTPS 或 SSH 格式的仓库地址
            </p>
          </div>

          {/* Quick templates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              快速填充
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setUrl("https://github.com/用户名/仓库名.git")}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                GitHub
              </button>
              <button
                type="button"
                onClick={() => setUrl("https://gitee.com/用户名/仓库名.git")}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Gitee
              </button>
              <button
                type="button"
                onClick={() => setUrl("https://gitlab.com/用户名/仓库名.git")}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                GitLab
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="modal-btn modal-btn-secondary">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim() || !url.trim()}
            className="modal-btn modal-btn-primary"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                添加中...
              </>
            ) : (
              "添加"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
