import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface ConfirmActionDialogProps {
  model: DockerImageToolModel;
}

export function ConfirmActionDialog({ model }: ConfirmActionDialogProps) {
  const { state, setters } = model;
  const [confirming, setConfirming] = useState(false);
  const request = state.confirmRequest;
  if (!request) return null;

  async function handleConfirm() {
    if (!request || confirming) return;
    setConfirming(true);
    try {
      await request.onConfirm();
      setters.setConfirmRequest(null);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${request.danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
              <AlertTriangle size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{request.title}</div>
              <div className="mt-1 text-sm leading-6 text-gray-500">{request.message}</div>
            </div>
          </div>
          <button
            onClick={() => setters.setConfirmRequest(null)}
            disabled={confirming}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button onClick={() => setters.setConfirmRequest(null)} disabled={confirming} variant="secondary" size="sm">
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={confirming} variant={request.danger ? "danger" : "primary"} size="sm">
            {confirming ? "执行中..." : request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
