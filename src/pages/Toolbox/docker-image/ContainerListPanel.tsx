import { Square, Trash2 } from "lucide-react";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface ContainerListPanelProps {
  model: DockerImageToolModel;
}

export function ContainerListPanel({ model }: ContainerListPanelProps) {
  const { state, actions } = model;

  return (
    <div className="re-card p-4">
      <div className="text-sm font-semibold mb-3">容器</div>
      <div className="space-y-2 max-h-72 overflow-auto">
        {state.containers.map((container) => (
          <div key={container.id} className="border border-gray-200 rounded p-2 text-xs">
            <div className="font-medium truncate" title={container.names || container.id}>{container.names || container.id}</div>
            <div className="font-mono text-gray-500 truncate" title={container.image}>{container.image}</div>
            <div className="text-gray-400 mt-1">{container.status}</div>
            {container.ports && <div className="text-gray-400 truncate" title={container.ports}>{container.ports}</div>}
            <div className="flex gap-1 mt-2">
              <button onClick={() => actions.stopContainer(container.id)} className="px-2 py-1 rounded bg-orange-50 text-orange-600" title="停止">
                <Square size={12} />
              </button>
              <button onClick={() => actions.removeContainer(container.id)} className="px-2 py-1 rounded bg-red-50 text-red-600" title="删除">
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
