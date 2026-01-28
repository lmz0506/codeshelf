import { useState } from "react";
import { Download, RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { checkForUpdates, downloadAndInstallUpdate, type UpdateInfo } from "@/services/updater";

export function UpdateSettings() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckUpdate() {
    setChecking(true);
    setError(null);
    try {
      const info = await checkForUpdates();
      setUpdateInfo(info);
    } catch (err) {
      setError(String(err));
    } finally {
      setChecking(false);
    }
  }

  async function handleDownloadUpdate() {
    setDownloading(true);
    setError(null);
    setProgress(0);
    try {
      await downloadAndInstallUpdate((downloaded, total) => {
        setProgress(Math.round((downloaded / total) * 100));
      });
    } catch (err) {
      setError(String(err));
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900">应用更新</h4>
      </div>

      {/* 当前版本 */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">当前版本</p>
            <p className="text-xs text-gray-500 mt-1">v0.1.0</p>
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={checking || downloading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {checking ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {checking ? "检查中..." : "检查更新"}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* 更新信息 */}
      {updateInfo && !error && (
        <div className={`p-4 border rounded-lg ${updateInfo.available ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          {updateInfo.available ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700">
                <Download size={16} />
                <span className="text-sm font-medium">发现新版本：v{updateInfo.version}</span>
              </div>
              {updateInfo.body && (
                <div className="text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {updateInfo.body}
                </div>
              )}
              {downloading ? (
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center">{progress}% 下载中...</p>
                </div>
              ) : (
                <button
                  onClick={handleDownloadUpdate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  <Download size={16} />
                  下载并安装更新
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-sm">已是最新版本</span>
            </div>
          )}
        </div>
      )}

      {/* 说明 */}
      <div className="p-3 bg-blue-50/50 border border-blue-200/50 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            应用会自动检查 GitHub Releases 上的新版本。下载完成后将自动重启应用以完成更新。
          </div>
        </div>
      </div>
    </div>
  );
}
