import { useEffect, useRef } from "react";
import { X, Copy } from "lucide-react";
import QRCode from "qrcode";
import { Modal } from "@/components/common";
import type { PairDropNetworkUrl } from "@/types/toolbox";

interface UrlsModalProps {
  urls: PairDropNetworkUrl[];
  onClose: () => void;
  onToast?: (msg: string, type?: "info" | "success" | "error") => void;
}

export function UrlsModal({ urls, onClose, onToast }: UrlsModalProps) {
  return (
    <Modal open onClose={onClose} size="md">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">扫码 / 复制接入地址</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
          使用手机或其他设备的浏览器扫描下方二维码，或在同一局域网内访问对应地址，
          即可加入这个传输房间。所有数据只在本机内存中转，关闭页面后自动清除。
        </p>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {urls.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              未发现可用网卡，请检查网络
            </p>
          ) : (
            urls.map((u) => (
              <UrlCard key={`${u.interface}-${u.ip}`} url={u} onToast={onToast} />
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function UrlCard({
  url,
  onToast,
}: {
  url: PairDropNetworkUrl;
  onToast?: (msg: string, type?: "info" | "success" | "error") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url.url, {
      width: 160,
      margin: 1,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch((e) => console.error("qr error", e));
  }, [url.url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url.url);
      onToast?.("地址已复制", "success");
    } catch {
      onToast?.("复制失败", "error");
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 flex gap-3">
      <div className="bg-white rounded p-1 flex-shrink-0">
        <canvas ref={canvasRef} width={160} height={160} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="text-xs text-gray-400 mb-1 truncate">
          {url.interface} · {url.ip}
        </div>
        <div className="text-sm font-mono break-all text-gray-700 dark:text-gray-200 mb-2">
          {url.url}
        </div>
        <button
          onClick={copy}
          className="self-start inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
        >
          <Copy size={12} />
          复制地址
        </button>
      </div>
    </div>
  );
}
