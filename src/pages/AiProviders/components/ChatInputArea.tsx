import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Paperclip, Send, Square, X } from "lucide-react";
import type { AttachedFile } from "../utils";

interface ChatInputAreaProps {
  input: string;
  attachedFiles: AttachedFile[];
  streaming: boolean;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAttachFiles: () => void;
  onAttachFolder: () => void;
  onToggleFile: (index: number) => void;
  onRemoveFile: (index: number) => void;
}

export function ChatInputArea({
  input,
  attachedFiles,
  streaming,
  loading,
  onInputChange,
  onSend,
  onStop,
  onAttachFiles,
  onAttachFolder,
  onToggleFile,
  onRemoveFile,
}: ChatInputAreaProps) {
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAttachMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAttachMenu]);

  const hasEnabledFiles = attachedFiles.some((f) => f.enabled);

  return (
    <div className="border-t border-gray-200 p-4 bg-white shrink-0">
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto">
          {attachedFiles.map((file, idx) => (
            <span
              key={`${file.path}-${idx}`}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border cursor-pointer select-none ${
                file.enabled
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-gray-50 text-gray-400 border-gray-200 line-through"
              }`}
              onClick={() => onToggleFile(idx)}
              title={file.path}
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                file.enabled ? "bg-blue-500 border-blue-500" : "border-gray-300 bg-white"
              }`}>
                {file.enabled && <Check size={10} className="text-white" />}
              </span>
              <Paperclip size={10} />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                className="ml-0.5 text-gray-400 hover:text-red-500"
                onClick={(e) => { e.stopPropagation(); onRemoveFile(idx); }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="relative shrink-0" ref={attachMenuRef}>
          <button
            className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
            onClick={() => setShowAttachMenu((prev) => !prev)}
            title="附加文件/文件夹"
            disabled={streaming}
          >
            <Paperclip size={18} />
          </button>
          {showAttachMenu && (
            <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36 z-10">
              <button
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                onClick={() => { setShowAttachMenu(false); onAttachFiles(); }}
              >
                <Paperclip size={14} /> 选择文件
              </button>
              <button
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                onClick={() => { setShowAttachMenu(false); onAttachFolder(); }}
              >
                <FolderOpen size={14} /> 选择文件夹
              </button>
            </div>
          )}
        </div>
        <textarea
          className="flex-1 border border-gray-200 rounded-lg p-3 text-sm resize-none"
          rows={3}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="输入用于验证的内容..."
        />
        <div className="flex flex-col gap-1 shrink-0">
          {streaming ? (
            <button
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg flex items-center gap-1"
              onClick={onStop}
            >
              <Square size={12} /> 停止
            </button>
          ) : (
            <button
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1 disabled:opacity-60"
              onClick={onSend}
              disabled={loading || (!input.trim() && !hasEnabledFiles)}
            >
              <Send size={12} /> 发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
