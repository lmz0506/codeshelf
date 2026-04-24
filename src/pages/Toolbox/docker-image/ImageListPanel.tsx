import { Play, Send, Trash2 } from "lucide-react";
import type { DockerImageToolModel } from "./useDockerImageTool";
import { imageRef } from "./utils";

interface ImageListPanelProps {
  model: DockerImageToolModel;
}

export function ImageListPanel({ model }: ImageListPanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="re-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">镜像</div>
        <button onClick={actions.refreshDockerLists} className="text-xs text-blue-500">刷新</button>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto">
        {state.images.map((image) => {
          const ref = imageRef(image);
          return (
            <div key={`${image.id}-${image.repository}-${image.tag}`} className="border border-gray-200 rounded p-2 text-xs">
              <div className="font-mono text-gray-800 truncate" title={ref}>{ref}</div>
              <div className="text-gray-400 mt-1">{image.id} · {image.size} · {image.createdSince}</div>
              <div className="flex gap-1 mt-2">
                <button onClick={() => setters.setRunImage(ref)} className="px-2 py-1 rounded bg-green-50 text-green-600" title="填入运行">
                  <Play size={12} />
                </button>
                <button onClick={() => actions.pushImage(ref)} className="px-2 py-1 rounded bg-blue-50 text-blue-600" title="推送">
                  <Send size={12} />
                </button>
                <button onClick={() => actions.removeImage(ref)} className="px-2 py-1 rounded bg-red-50 text-red-600" title="删除">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
        {state.images.length === 0 && <div className="text-xs text-gray-400">暂无镜像</div>}
      </div>
    </div>
  );
}
