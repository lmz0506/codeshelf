import { useEffect, useMemo, useState } from "react";
import { X, Wrench } from "lucide-react";
import type { ToolSchema } from "@/services/chat";

interface ToolPickerProps {
  open: boolean;
  toolSchemas: ToolSchema[];
  onClose: () => void;
  onSelect: (hint: string) => void;
}

export function ToolPicker({ open, toolSchemas, onClose, onSelect }: ToolPickerProps) {
  const [selected, setSelected] = useState<ToolSchema | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return toolSchemas;
    return toolSchemas.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [toolSchemas, query]);

  if (!open) return null;

  const parametersPreview = selected
    ? (() => {
        try {
          return JSON.stringify(selected.parameters, null, 2);
        } catch {
          return String(selected.parameters);
        }
      })()
    : "";

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[720px] max-w-[92vw] h-[70vh] flex overflow-hidden">
        <div className="w-64 border-r border-gray-200 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
            <Wrench size={14} className="text-blue-500" />
            <input
              className="flex-1 text-xs outline-none"
              placeholder="搜索工具..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.map((s) => (
              <button
                key={s.name}
                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-50 ${selected?.name === s.name ? "bg-blue-50" : ""}`}
                onClick={() => setSelected(s)}
              >
                <div className="font-mono text-blue-700 text-xs">{s.name}</div>
                <div className="text-[11px] text-gray-500 truncate">{s.description}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-gray-400">无匹配</div>}
          </div>
        </div>
        <div className="flex-1 flex flex-col p-4 space-y-3">
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              选择左侧工具查看参数结构
            </div>
          )}
          {selected && (
            <>
              <div className="space-y-1">
                <div className="font-mono font-semibold text-blue-700">{selected.name}</div>
                <div className="text-xs text-gray-500">{selected.description}</div>
                {selected.requiresCwd && (
                  <div className="text-[11px] text-amber-600">⚠ 需要会话已设置目录（allowedCwd）</div>
                )}
              </div>
              <div className="text-[11px] text-gray-400">参数 schema（只读，供 LLM 参考）</div>
              <pre className="flex-1 overflow-auto bg-gray-50 border border-gray-200 rounded p-2 text-xs font-mono whitespace-pre-wrap">
                {parametersPreview}
              </pre>
              <div className="text-[11px] text-gray-400">
                确认后将插入：<code className="font-mono text-blue-600">[使用 {selected.name} 工具]</code>
              </div>
              <div className="flex justify-end gap-2">
                <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onClose}>
                  取消
                </button>
                <button
                  className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
                  onClick={() => {
                    onSelect(`[使用 ${selected.name} 工具]\n`);
                    onClose();
                  }}
                >
                  插入到输入框
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
