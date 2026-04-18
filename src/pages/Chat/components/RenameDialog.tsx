import { useEffect, useRef, useState } from "react";

interface RenameDialogProps {
  open: boolean;
  initialValue: string;
  title?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function RenameDialog({ open, initialValue, title = "重命名会话", onCancel, onConfirm }: RenameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, initialValue]);

  if (!open) return null;

  function handleConfirm() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-80 space-y-3">
        <div className="text-sm font-semibold">{title}</div>
        <input
          ref={inputRef}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onCancel}>
            取消
          </button>
          <button className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg" onClick={handleConfirm}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
