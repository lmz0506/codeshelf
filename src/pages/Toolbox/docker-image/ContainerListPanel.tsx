import { Square, Trash2 } from "lucide-react";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface ContainerListPanelProps {
  model: DockerImageToolModel;
}

export function ContainerListPanel({ model }: ContainerListPanelProps) {
  const { state, actions } = model;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold text-gray-900">容器</div>
        <div className="text-xs text-gray-400 mt-0.5">{state.containers.length} 个容器</div>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto">
        {state.containers.map((container) => (
          <div key={container.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 text-xs">
            <div className="font-medium text-gray-900 truncate" title={container.names || container.id}>{container.names || container.id}</div>
            <div className="font-mono text-gray-500 truncate" title={container.image}>{container.image}</div>
            <div className="text-gray-400 mt-1">{container.status}</div>
            {container.ports && <div className="text-gray-400 truncate" title={container.ports}>{container.ports}</div>}
            <div className="flex gap-1 mt-2">
              <button onClick={() => actions.stopContainer(container.id)} className="h-7 w-8 inline-flex items-center justify-center rounded-md bg-orange-50 text-orange-600 hover:bg-orange-100" title="停止">
                <Square size={12} />
              </button>
              <button onClick={() => actions.removeContainer(container.id)} className="h-7 w-8 inline-flex items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-100" title="删除">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {state.containers.length === 0 && <div className="text-xs text-gray-400">暂无容器</div>}
      </div>
    </div>
  );
}
