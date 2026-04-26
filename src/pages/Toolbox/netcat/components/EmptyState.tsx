// 空状态占位组件

import { Radio, Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateSession: () => void;
}

export default function EmptyState({ onCreateSession }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
          <Radio size={32} className="text-cyan-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 mb-4">选择或创建一个会话开始测试</p>
        <button
          onClick={onCreateSession}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
        >
          <Plus size={18} />
          新建会话
        </button>
      </div>
    </div>
  );
}
