import { Play, Send, Trash2 } from "lucide-react";
import type { DockerImageToolModel } from "./useDockerImageTool";
import { imageRef } from "./utils";

interface ImageListPanelProps {
  model: DockerImageToolModel;
}

export function ImageListPanel({ model }: ImageListPanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">镜像</div>
          <div className="text-xs text-gray-400 mt-0.5">{state.images.length} 个本地镜像</div>
        </div>
        <button onClick={actions.refreshDockerLists} className="text-xs text-blue-500">刷新</button>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto">
        {state.images.map((image) => {
          const ref = imageRef(image);
          return (
            <div key={`${image.id}-${image.repository}-${image.tag}`} className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 text-xs">
              <div className="font-mono text-gray-900 truncate" title={ref}>{ref}</div>
              <div className="text-gray-400 mt-1 truncate">{image.id} · {image.size} · {image.createdSince}</div>
              <div className="flex gap-1 mt-2">
                <button onClick={() => setters.setRunImage(ref)} className="h-7 w-8 inline-flex items-center justify-center rounded-md bg-green-50 text-green-600 hover:bg-green-100" title="填入运行">
                  <Play size={12} />
                </button>
                <button onClick={() => actions.pushImage(ref)} className="h-7 w-8 inline-flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100" title="推送">
                  <Send size={12} />
                </button>
                <button onClick={() => actions.removeImage(ref)} className="h-7 w-8 inline-flex items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-100" title="删除">
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
