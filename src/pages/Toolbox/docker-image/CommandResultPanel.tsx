import type { DockerCommandResult } from "@/types/toolbox";
import { commandSummary } from "./utils";

interface CommandResultPanelProps {
  result: DockerCommandResult | null;
}

export function CommandResultPanel({ result }: CommandResultPanelProps) {
  if (!result) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className={`text-sm font-semibold mb-2 ${result.success ? "text-green-600" : "text-red-500"}`}>
        {result.success ? "命令执行成功" : "命令执行失败"}
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100 whitespace-pre-wrap">
        {commandSummary(result)}
      </pre>
    </div>
  );
}
