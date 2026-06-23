import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ArchStatus } from "@/services/updater";

export type ArchMismatchChoice = "same" | "correct";

interface Props {
  open: boolean;
  arch: ArchStatus;
  /** 即将下载的新版本号 */
  version?: string;
  /** 用户取消（点 X、点取消） */
  onCancel: () => void;
  /** 用户已显式选择并按下"确认"按钮才会回调；点确认前 onConfirm 不会被调用 */
  onConfirm: (choice: ArchMismatchChoice) => void;
}

function archLabel(arch: string): string {
  if (arch === "aarch64") return "Apple Silicon (arm64)";
  if (arch === "x86_64") return "Intel (x86_64)";
  return arch;
}

/**
 * 架构不匹配确认弹窗。
 *
 * 严格的两步交互：
 *   1. 用户必须从两个 radio 选项里挑一个；未选时"确认"按钮 disabled
 *   2. 点"确认"才执行 onConfirm；关闭/取消 → onCancel，什么都不做
 */
export function ArchMismatchDialog({ open, arch, version, onCancel, onConfirm }: Props) {
  const [choice, setChoice] = useState<ArchMismatchChoice | null>(null);

  if (!open) return null;

  const binaryLabel = archLabel(arch.binaryArch);
  const hostLabel = archLabel(arch.hostArch);
  const versionText = version ? `v${version}` : "新版本";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arch-mismatch-title"
    >
      <div className="w-[min(520px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 id="arch-mismatch-title" className="text-base font-semibold text-gray-900">
                检测到架构不匹配
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                当前 App 是 <span className="font-medium">{binaryLabel}</span>，
                但你的系统是 <span className="font-medium">{hostLabel}</span>
                {arch.isRosetta ? "（通过 Rosetta 翻译运行）" : ""}。
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-700">请选择如何下载 {versionText}：</p>

          <label
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              choice === "correct"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="arch-choice"
              className="mt-1"
              checked={choice === "correct"}
              onChange={() => setChoice("correct")}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                下载匹配系统的 {archLabel(arch.hostArch)} 版本（推荐）
              </div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                浏览器会自动开始下载对应 dmg，下载完成后双击打开，把 CodeShelf 拖到
                Applications 替换原有 app 即可。数据保留在系统目录，不会丢失。
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              choice === "same"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="arch-choice"
              className="mt-1"
              checked={choice === "same"}
              onChange={() => setChoice("same")}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                继续下载当前 {archLabel(arch.binaryArch)} 版本
              </div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                走 App 内置自动更新，无需手动操作。注意：未来 macOS 将停止支持
                Intel 二进制，长期建议切换。
              </div>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 bg-gray-50 border-t border-gray-100 rounded-b-xl">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => choice && onConfirm(choice)}
            disabled={!choice}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
