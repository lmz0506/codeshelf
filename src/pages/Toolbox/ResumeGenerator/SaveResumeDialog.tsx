import { Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/common";
import { Button } from "@/components/ui";

interface SaveResumeDialogProps {
  open: boolean;
  defaultName: string;
  title?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void | Promise<void>;
}

export function SaveResumeDialog({
  open,
  defaultName,
  title = "命名简历",
  onCancel,
  onConfirm,
}: SaveResumeDialogProps) {
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setSubmitting(false);
      const t = setTimeout(() => inputRef.current?.select(), 0);
      return () => clearTimeout(t);
    }
  }, [open, defaultName]);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(name.trim() || defaultName);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      icon={Save}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel} variant="secondary" disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleConfirm} variant="primary" disabled={submitting}>
            {submitting ? "保存中..." : "保存"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="block text-sm text-gray-700">简历名字</label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleConfirm();
            }
          }}
          placeholder={defaultName}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500">留空将使用默认名:{defaultName}</p>
      </div>
    </Dialog>
  );
}
