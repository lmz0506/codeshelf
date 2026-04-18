import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getWorkflow, type Workflow } from "@/services/workflows";

interface Props {
  id: string | null;
  open: boolean;
  onClose: () => void;
}

export function RunDetail({ id, open, onClose }: Props) {
  const [wf, setWf] = useState<Workflow | null>(null);

  useEffect(() => {
    if (!open || !id) return;
    getWorkflow(id).then(setWf).catch(() => setWf(null));
  }, [open, id]);

  if (!open) return null;
  const run = wf?.lastRun;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg w-[720px] max-w-[95vw] max-h-[92vh] overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">上次运行 · {wf?.name ?? ""}</div>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        {!run && <div className="text-xs text-gray-500">尚未运行</div>}
        {run && (
          <>
            <div className="text-xs text-gray-600 flex gap-3 flex-wrap">
              <span>状态：<span className={run.status === "success" ? "text-emerald-600" : run.status === "failure" ? "text-red-500" : "text-blue-500"}>{run.status}</span></span>
              <span>开始：{run.startedAt}</span>
              <span>结束：{run.finishedAt || "-"}</span>
            </div>
            {run.error && (
              <div className="border border-red-200 bg-red-50 rounded p-2 text-xs text-red-700 whitespace-pre-wrap">{run.error}</div>
            )}
            <div className="space-y-2">
              {wf!.nodes.map((n) => {
                const out = run.outputs?.[n.id];
                return (
                  <div key={n.id} className="border border-gray-200 rounded p-2">
                    <div className="text-[11px] text-gray-500 font-mono">{n.id} · {n.nodeType}</div>
                    <pre className="text-[11px] mt-1 whitespace-pre-wrap break-words max-h-[200px] overflow-auto bg-gray-50 rounded p-2">
                      {out ?? "（未执行或无输出）"}
                    </pre>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
