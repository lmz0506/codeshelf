import { Filter } from "lucide-react";

interface FolderFilterDialogProps {
  dirPath: string;
  mode: "extension" | "filename";
  value: string;
  onModeChange: (mode: "extension" | "filename") => void;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function FolderFilterDialog({
  dirPath,
  mode,
  value,
  onModeChange,
  onValueChange,
  onCancel,
  onConfirm,
}: FolderFilterDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-5 w-96 space-y-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-blue-500" />
          <div className="text-sm font-semibold">文件夹过滤</div>
        </div>
        <div className="text-xs text-gray-500 break-all">{dirPath}</div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              className={`px-3 py-1.5 text-xs rounded-lg border ${mode === "extension" ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 text-gray-600"}`}
              onClick={() => onModeChange("extension")}
            >
              按后缀过滤
            </button>
            <button
              className={`px-3 py-1.5 text-xs rounded-lg border ${mode === "filename" ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 text-gray-600"}`}
              onClick={() => onModeChange("filename")}
            >
              按文件名过滤
            </button>
          </div>
          <div>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder={mode === "extension" ? "如: ts,tsx,js（留空则包含所有文本文件）" : "如: *.test.ts 或 config（支持 * 通配符）"}
              onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); }}
            />
            <div className="text-xs text-gray-400 mt-1">
              {mode === "extension" ? "多个后缀用逗号分隔，留空包含所有常见文本文件" : "支持 * 通配符匹配，留空包含所有常见文本文件"}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onCancel}>取消</button>
          <button className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg" onClick={onConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}
