import { useState } from "react";
import { X, Globe, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { showToast } from "@/components/ui";
import { addRemote, verifyRemoteUrl } from "@/services/git";

interface AddRemoteModalProps {
  projectPath: string;
  onClose: () => void;
  onSuccess?: (remoteName?: string) => void;
}

export function AddRemoteModal({ projectPath, onClose, onSuccess }: AddRemoteModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  async function handleVerify() {
    if (!url.trim()) {
      showToast("error", "验证失败", "请输入远程仓库地址");
      return;
    }

    try {
      setVerifying(true);
      setVerified(false);
      setVerifyFailed(false);
      setVerifyError("");
      await verifyRemoteUrl(url.trim());
      setVerified(true);
      setVerifyFailed(false);
      showToast("success", "验证成功", "远程仓库地址有效");
    } catch (error) {
      console.error("Failed to verify remote:", error);
      const errorMsg = String(error);
      setVerifyError(errorMsg);
      setVerified(false);
      setVerifyFailed(true);
      showToast("warning", "验证失败", "可选择跳过验证直接添加");
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmit(forceAdd: boolean = false) {
    if (!name.trim()) {
      showToast("error", "添加失败", "请输入远程仓库名称");
      return;
    }
    if (!url.trim()) {
      showToast("error", "添加失败", "请输入远程仓库地址");
      return;
    }
    if (!verified && !forceAdd) {
      showToast("warning", "请先验证", "请先验证远程仓库地址，或点击「跳过验证添加」");
      return;
    }

    try {
      setLoading(true);
      await addRemote(projectPath, name.trim(), url.trim());
      showToast("success", "添加成功", `远程仓库 ${name} 已添加`);
      onSuccess?.(name.trim());
      onClose();
    } catch (error) {
      console.error("Failed to add remote:", error);
      showToast("error", "添加失败", String(error));
    } finally {
      setLoading(false);
    }
  }

  // URL 改变时重置验证状态
  function handleUrlChange(newUrl: string) {
    setUrl(newUrl);
    setVerified(false);
    setVerifyFailed(false);
    setVerifyError("");
  }

  // 是否可以添加（已验证 或 验证失败但可强制添加）
  const canAdd = !!(name.trim() && url.trim() && (verified || verifyFailed));
  const needsVerify = !!(name.trim() && url.trim() && !verified && !verifyFailed);

  return (
    <div className="modal-overlay animate-fade-in" onClick={(e) => e.stopPropagation()}>
      <div className="modal-content animate-scale-in max-w-lg" onClick={(e) => e.stopPropagation()}>
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
              placeholder="例如: backup, upstream, gitee"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              建议使用有意义的名称，如 backup、gitee、gitlab 等
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              仓库地址 (URL)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://github.com/username/repo.git"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying || !url.trim()}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {verifying ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : verified ? (
                  <CheckCircle size={14} className="text-green-500" />
                ) : verifyFailed ? (
                  <AlertTriangle size={14} className="text-yellow-500" />
                ) : null}
                {verifying ? "验证中..." : verified ? "已验证" : verifyFailed ? "验证失败" : "验证"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              支持 HTTPS 或 SSH 格式，验证失败时可选择跳过直接添加
            </p>
          </div>

          {/* 验证失败提示 */}
          {verifyFailed && verifyError && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    验证失败
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 break-words">
                    {verifyError}
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                    如果确认地址正确，可以跳过验证直接添加
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quick templates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              快速填充
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleUrlChange("https://github.com/用户名/仓库名.git")}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                GitHub
              </button>
              <button
                type="button"
                onClick={() => handleUrlChange("https://gitee.com/用户名/仓库名.git")}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Gitee
              </button>
              <button
                type="button"
                onClick={() => handleUrlChange("https://gitlab.com/用户名/仓库名.git")}
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

          {/* 验证失败时显示跳过验证按钮 */}
          {verifyFailed && (
            <button
              onClick={() => handleSubmit(true)}
              disabled={loading || !name.trim() || !url.trim()}
              className="modal-btn bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2" />
                  添加中...
                </>
              ) : (
                "跳过验证添加"
              )}
            </button>
          )}

          <button
            onClick={() => handleSubmit(false)}
            disabled={loading || !canAdd || needsVerify}
            className="modal-btn modal-btn-primary"
            title={needsVerify ? "请先点击验证按钮" : undefined}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                添加中...
              </>
            ) : needsVerify ? (
              "请先验证"
            ) : (
              "添加"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
