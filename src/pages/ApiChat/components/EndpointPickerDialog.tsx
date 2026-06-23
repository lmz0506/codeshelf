import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { ApiEndpoint, ApiGroup } from "@/types";

interface EndpointPickerDialogProps {
  open: boolean;
  groups: ApiGroup[];
  endpoints: ApiEndpoint[];
  initialSelected: string[];
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

export function EndpointPickerDialog({
  open,
  groups,
  endpoints,
  initialSelected,
  onCancel,
  onConfirm,
}: EndpointPickerDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set(initialSelected));
  }, [open, initialSelected]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, ApiEndpoint[]>();
    const orphans: ApiEndpoint[] = [];
    for (const ep of endpoints) {
      if (ep.groupId) {
        if (!byGroup.has(ep.groupId)) byGroup.set(ep.groupId, []);
        byGroup.get(ep.groupId)!.push(ep);
      } else {
        orphans.push(ep);
      }
    }
    return { byGroup, orphans };
  }, [endpoints]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupId: string, allChecked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const list = grouped.byGroup.get(groupId) ?? [];
      if (allChecked) list.forEach((e) => next.delete(e.id));
      else list.forEach((e) => next.add(e.id));
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-lg w-[560px] max-w-[92vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold">选择接口（已选 {selected.size}）</div>
          <button className="text-gray-400 hover:text-gray-700" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 text-xs space-y-3">
          {groups.map((g) => {
            const list = grouped.byGroup.get(g.id) ?? [];
            if (list.length === 0) return null;
            const allChecked = list.every((e) => selected.has(e.id));
            return (
              <div key={g.id} className="border border-gray-200 rounded p-2">
                <label className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => toggleGroup(g.id, allChecked)}
                  />
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{g.baseUrl}</span>
                </label>
                <div className="space-y-1 pl-5">
                  {list.map((ep) => (
                    <label key={ep.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1">
                      <input
                        type="checkbox"
                        checked={selected.has(ep.id)}
                        onChange={() => toggle(ep.id)}
                      />
                      <span className={`font-mono px-1 rounded text-[10px] ${
                        ep.method === "GET" ? "bg-green-100 text-green-700" :
                        ep.method === "DELETE" ? "bg-red-100 text-red-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{ep.method}</span>
                      <span className="flex-1 truncate">{ep.name}</span>
                      <span className="text-gray-400 font-mono text-[10px] truncate">{ep.url}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          {grouped.orphans.length > 0 && (
            <div className="border border-gray-200 rounded p-2">
              <div className="font-semibold mb-1">独立接口</div>
              <div className="space-y-1 pl-1">
                {grouped.orphans.map((ep) => (
                  <label key={ep.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1">
                    <input
                      type="checkbox"
                      checked={selected.has(ep.id)}
                      onChange={() => toggle(ep.id)}
                    />
                    <span className={`font-mono px-1 rounded text-[10px] ${
                      ep.method === "GET" ? "bg-green-100 text-green-700" :
                      ep.method === "DELETE" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{ep.method}</span>
                    <span className="flex-1 truncate">{ep.name}</span>
                    <span className="text-gray-400 font-mono text-[10px] truncate">{ep.url}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {endpoints.length === 0 && (
            <div className="text-gray-400">接口库为空，先去"接口库"里新建</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onCancel}>
            取消
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1"
            onClick={() => onConfirm(Array.from(selected))}
          >
            <Check size={12} /> 确认
          </button>
        </div>
      </div>
    </div>
  );
}
