import {
  AlertCircle,
  Check,
  Copy,
  Edit2,
  KeyRound,
  Lock,
  Network,
  Play,
  PlugZap,
  Settings2,
  Square,
  Trash2,
} from "lucide-react";
import type { SshTunnel } from "@/types/toolbox";
import { formatBytes } from "@/services/toolbox";
import type { TunnelListCallbacks } from "./types";

interface TunnelListProps {
  tunnels: SshTunnel[];
  copiedId: string | null;
  callbacks: TunnelListCallbacks;
}

function authBadge(t: SshTunnel) {
  if (t.auth.type === "key") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <KeyRound size={11} />
        密钥
      </span>
    );
  }
  if (t.auth.type === "password") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Lock size={11} />
        密码
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
      <Settings2 size={11} />
      ssh_config: {t.auth.hostAlias}
    </span>
  );
}

export function TunnelList({ tunnels, copiedId, callbacks }: TunnelListProps) {
  if (tunnels.length === 0) {
    return null;
  }
  return (
    <div className="space-y-4">
      {tunnels.map((t) => (
        <div key={t.id} className="re-card p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-2">
                <Network size={18} className="text-emerald-500" />
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    t.status === "running" ? "bg-green-500 animate-pulse" : "bg-gray-300"
                  }`}
                />
              </div>

              <div className="min-w-0">
                <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <span>{t.name}</span>
                  <span className="text-xs text-gray-400">SSH 隧道</span>
                </h4>

                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-sm font-mono ${
                      t.status === "running" ? "text-emerald-500" : "text-gray-400"
                    }`}
                  >
                    127.0.0.1:{t.localPort}
                  </span>
                  <button
                    onClick={() => callbacks.onCopyLocal(t)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    title="复制本地地址"
                  >
                    {copiedId === t.id ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className="text-gray-400" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 flex-wrap">
                  <span className="font-mono">
                    {t.sshUser ? `${t.sshUser}@` : ""}
                    {t.sshHost}:{t.sshPort}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="font-mono">
                    {t.remoteHost}:{t.remotePort}
                  </span>
                  {authBadge(t)}
                </div>

                {t.lastError && (
                  <div className="flex items-start gap-1 mt-2 text-xs text-red-500">
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{t.lastError}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 flex-shrink-0">
              {t.status === "running" && (
                <div className="text-sm text-gray-500 space-y-0.5">
                  <div>
                    连接: <span className="font-medium">{t.connections}</span>
                  </div>
                  <div>
                    入: <span className="font-medium">{formatBytes(t.bytesIn)}</span>
                    {" | "}
                    出: <span className="font-medium">{formatBytes(t.bytesOut)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1">
                {t.status === "running" ? (
                  <>
                    <button
                      onClick={() => callbacks.onTest(t)}
                      className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors text-emerald-500"
                      title="测试连通性"
                    >
                      <PlugZap size={16} />
                    </button>
                    <button
                      onClick={() => callbacks.onStop(t.id)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-500"
                      title="停止"
                    >
                      <Square size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => callbacks.onStart(t.id)}
                      className="p-2 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-green-500"
                      title="启动"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => callbacks.onEdit(t)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => callbacks.onRemove(t)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-500"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
