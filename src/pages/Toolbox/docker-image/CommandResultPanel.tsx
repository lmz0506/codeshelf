import type { DockerCommandResult } from "@/types/toolbox";
import { commandSummary } from "./utils";

interface CommandResultPanelProps {
  result: DockerCommandResult | null;
}

export function CommandResultPanel({ result }: CommandResultPanelProps) {
  if (!result) return null;

  return (
    <div className="re-card p-4">
      <div className={`text-sm font-semibold mb-2 ${result.success ? "text-green-600" : "text-red-500"}`}>
        {result.success ? "命令执行成功" : "命令执行失败"}
      </div>
      <pre className="max-h-80 overflow-auto bg-gray-950 text-gray-100 rounded p-3 text-xs whitespace-pre-wrap">
        {commandSummary(result)}
      </pre>
    </div>
  );
}
