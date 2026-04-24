import { useState } from "react";
import { Play, Send, Square, Trash2 } from "lucide-react";
import type { DockerImageToolModel } from "./useDockerImageTool";
import { imageRef } from "./utils";

type ResourceTab = "images" | "containers";

interface ResourcePanelProps {
  model: DockerImageToolModel;
}

export function ResourcePanel({ model }: ResourcePanelProps) {
  const { state, setters, actions } = model;
  const [tab, setTab] = useState<ResourceTab>("images");

  return (
    <div className="min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">本地资源</div>
            <div className="mt-0.5 text-xs text-gray-400">
              {state.images.length} 个镜像 · {state.containers.length} 个容器
            </div>
          </div>
          <button onClick={actions.refreshDockerLists} className="text-xs text-blue-500">刷新</button>
        </div>

        <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setTab("images")}
            className={`h-8 rounded-md text-sm font-medium transition-colors ${
              tab === "images" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            镜像
          </button>
          <button
            onClick={() => setTab("containers")}
            className={`h-8 rounded-md text-sm font-medium transition-colors ${
              tab === "containers" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            容器
          </button>
        </div>
      </div>

      <div className="max-h-[520px] space-y-2 overflow-auto p-3">
        {tab === "images" ? (
          <>
            {state.images.map((image) => {
              const ref = imageRef(image);
              return (
                <div key={`${image.id}-${image.repository}-${image.tag}`} className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs hover:border-blue-200">
                  <div className="truncate font-mono text-gray-900" title={ref}>{ref}</div>
                  <div className="mt-1 truncate text-gray-400">{image.id} · {image.size} · {image.createdSince}</div>
                  <div className="mt-2 flex gap-1">
                    <button onClick={() => setters.setRunImage(ref)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-green-50 text-green-600 hover:bg-green-100" title="填入运行">
                      <Play size={12} />
                    </button>
                    <button onClick={() => actions.pushImage(ref)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100" title="推送">
                      <Send size={12} />
                    </button>
                    <button onClick={() => actions.removeImage(ref)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-100" title="删除">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
            {state.images.length === 0 && <div className="py-8 text-center text-xs text-gray-400">暂无镜像</div>}
          </>
        ) : (
          <>
            {state.containers.map((container) => (
              <div key={container.id} className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs hover:border-blue-200">
                <div className="truncate font-medium text-gray-900" title={container.names || container.id}>{container.names || container.id}</div>
                <div className="truncate font-mono text-gray-500" title={container.image}>{container.image}</div>
                <div className="mt-1 text-gray-400">{container.status}</div>
                {container.ports && <div className="truncate text-gray-400" title={container.ports}>{container.ports}</div>}
                <div className="mt-2 flex gap-1">
                  <button onClick={() => actions.stopContainer(container.id)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-orange-50 text-orange-600 hover:bg-orange-100" title="停止">
                    <Square size={12} />
                  </button>
                  <button onClick={() => actions.removeContainer(container.id)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-100" title="删除">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            {state.containers.length === 0 && <div className="py-8 text-center text-xs text-gray-400">暂无容器</div>}
          </>
        )}
      </div>
    </div>
  );
}
