import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import type { TestState } from "./types";

interface TestResultDialogProps {
  state: TestState;
  onDismiss: () => void;
}

export function TestResultDialog({ state, onDismiss }: TestResultDialogProps) {
  const { loading, result } = state;
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center gap-3 mb-3">
          {loading ? (
            <Loader2 size={22} className="text-gray-400 animate-spin" />
          ) : result?.success ? (
            <CheckCircle2 size={22} className="text-emerald-500" />
          ) : (
            <XCircle size={22} className="text-red-500" />
          )}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {loading ? "测试中..." : result?.success ? "连通正常" : "连通失败"}
          </h3>
          {result && (
            <span className="text-xs text-gray-400">
              {result.method} · {result.durationMs}ms
            </span>
          )}
        </div>

        {result && (
          <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs font-mono text-gray-700 dark:text-gray-300 max-h-64 overflow-auto whitespace-pre-wrap break-all">
            {result.output}
          </pre>
        )}

        {!loading && result && (
          <p className="text-xs text-gray-400 mt-2">
            {result.method === "nc" && "macOS / Linux 上用 nc -z -v -w 验证"}
            {result.method === "Test-NetConnection" && "Windows 上用 PowerShell Test-NetConnection 验证"}
            {result.method === "tcp" && "未找到系统命令，回退到纯 TCP 连接验证"}
          </p>
        )}

        <div className="flex justify-end mt-5">
          <Button onClick={onDismiss} variant="secondary">
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
