import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  host: string;
  port: string;
  running: boolean;
  busy: boolean;
  onHostChange: (v: string) => void;
  onPortChange: (v: string) => void;
  onStart: () => void;
  onStop: () => void;
}

/** 监听地址 / 端口 + 启停按钮。 */
export function GatewayListenerForm({
  host, port, running, busy,
  onHostChange, onPortChange, onStart, onStop,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_120px] gap-2 items-end">
      <label className="block text-xs text-gray-700">
        监听地址
        <input
          className="mt-1 h-9 w-full border border-gray-200 rounded px-2 text-sm font-mono"
          value={host}
          onChange={(e) => onHostChange(e.target.value)}
          placeholder="127.0.0.1"
        />
      </label>
      <label className="block text-xs text-gray-700">
        端口
        <input
          className="mt-1 h-9 w-full border border-gray-200 rounded px-2 text-sm font-mono"
          value={port}
          onChange={(e) => onPortChange(e.target.value)}
          placeholder="8787"
        />
      </label>
      {running ? (
        <Button variant="danger" onClick={onStop} disabled={busy} className="h-9 whitespace-nowrap">
          <Square size={15} className="mr-1" /> 停止
        </Button>
      ) : (
        <Button onClick={onStart} disabled={busy} className="h-9 whitespace-nowrap">
          <Play size={15} className="mr-1" /> 启动
        </Button>
      )}
    </div>
  );
}
