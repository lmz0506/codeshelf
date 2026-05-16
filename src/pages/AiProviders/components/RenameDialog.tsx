interface RenameDialogProps {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RenameDialog({ value, onChange, onCancel, onConfirm }: RenameDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-80 space-y-3">
        <div className="text-sm font-semibold">重命名会话</div>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onCancel}>取消</button>
          <button className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg" onClick={onConfirm}>保存</button>
        </div>
      </div>
    </div>
  );
}
