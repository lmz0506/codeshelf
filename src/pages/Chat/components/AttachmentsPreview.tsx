import type { ChatAttachment } from "@/types";

interface AttachmentsPreviewProps {
  attachments: ChatAttachment[];
  onRemove: (index: number) => void;
}

export function AttachmentsPreview({ attachments, onRemove }: AttachmentsPreviewProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex gap-2 mb-2 flex-wrap">
      {attachments.map((a, idx) =>
        a.kind === "image" ? (
          <div key={idx} className="relative w-20 h-20 border border-gray-200 rounded overflow-hidden group">
            <img src={a.dataUrl} alt="" className="w-full h-full object-cover" />
            <button
              className="absolute top-0 right-0 bg-black/60 text-white text-[10px] px-1 opacity-0 group-hover:opacity-100"
              onClick={() => onRemove(idx)}
            >
              ×
            </button>
          </div>
        ) : a.kind === "text" ? (
          <div
            key={idx}
            className="relative px-2 py-1 border border-gray-200 rounded text-[11px] text-gray-700 bg-gray-50 flex items-center gap-2 group"
            title={a.name}
          >
            <span>📄 {a.name}</span>
            <span className="text-gray-400">{Math.ceil(a.content.length / 1024)}KB</span>
            <button
              className="text-gray-400 hover:text-red-500"
              onClick={() => onRemove(idx)}
            >
              ×
            </button>
          </div>
        ) : null,
      )}
    </div>
  );
}
