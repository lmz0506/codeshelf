// 系统监控 - 终止进程确认弹窗。
// 父组件维护待终止进程信息（包含 source 用于刷新对应 tab）；这里只负责展示和回调。

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  pid: number;
  name: string;
  onCancel: () => void;
  onKill: (pid: number, force: boolean) => void;
}

export function SystemMonitorKillConfirm({ pid, name, onCancel, onKill }: Props) {
  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 text-red-500 mb-4">
          <AlertCircle size={24} />
          <h3 className="text-lg font-semibold">终止进程</h3>
        </div>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          确定要终止进程{" "}
          <span className="font-mono font-medium">{name}</span> (PID: {pid}) 吗？
        </p>

        <div className="flex justify-end gap-3">
          <Button onClick={onCancel} variant="secondary">
            取消
          </Button>
          <Button onClick={() => onKill(pid, false)} variant="danger">
            终止
          </Button>
          <Button onClick={() => onKill(pid, true)} variant="danger">
            强制终止
          </Button>
        </div>
      </div>
    </div>
  );
}
