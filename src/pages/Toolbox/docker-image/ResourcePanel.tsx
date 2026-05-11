import { useState } from "react";
import { FileText, FolderOpen, Play, RefreshCw, RotateCw, Send, Square, Trash2 } from "lucide-react";
import { openInEditor, openInExplorer } from "@/services/db";
import type { DockerContainerInfo } from "@/types/toolbox";
import type { DockerImageToolModel } from "./useDockerImageTool";
import { imageRef } from "./utils";

type ResourceTab = "images" | "containers";

interface ResourcePanelProps {
  model: DockerImageToolModel;
}

function stateBadge(c: DockerContainerInfo) {
  const map: Record<string, { dot: string; label: string; text: string }> = {
    running: { dot: "bg-green-500 animate-pulse", label: "运行中", text: "text-green-600" },
    paused: { dot: "bg-amber-500", label: "已暂停", text: "text-amber-600" },
    restarting: { dot: "bg-blue-500 animate-pulse", label: "重启中", text: "text-blue-600" },
    exited: { dot: "bg-gray-300", label: "已退出", text: "text-gray-500" },
    created: { dot: "bg-gray-300", label: "已创建", text: "text-gray-500" },
    dead: { dot: "bg-red-500", label: "已死亡", text: "text-red-600" },
    removing: { dot: "bg-gray-400 animate-pulse", label: "删除中", text: "text-gray-500" },
  };
  return map[c.state] || { dot: "bg-gray-300", label: c.state || "未知", text: "text-gray-500" };
}

export function ResourcePanel({ model }: ResourcePanelProps) {
  const { state, actions } = model;
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
          <button
            onClick={() => actions.refreshDockerLists()}
            disabled={state.refreshing}
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <RefreshCw size={12} className={state.refreshing ? "animate-spin" : ""} />
            {state.refreshing ? "刷新中..." : "刷新"}
          </button>
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
                    <button onClick={() => actions.openRunDialog(ref)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-green-50 text-green-600 hover:bg-green-100" title="配置并运行">
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
            {state.containers.map((container) => {
              const badge = stateBadge(container);
              const isRunning = container.state === "running" || container.state === "restarting";
              return (
                <div key={container.id} className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs hover:border-blue-200">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${badge.dot}`} />
                    <div className="truncate font-medium text-gray-900" title={container.names || container.id}>{container.names || container.id}</div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.text} bg-gray-50`}>
                      {badge.label}
                    </span>
                    {container.composeProject && (
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">compose</span>
                    )}
                  </div>
                  <div className="truncate font-mono text-gray-500" title={container.image}>{container.image}</div>
                  {container.composeProject && (
                    <div className="mt-1 space-y-0.5 rounded-md bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500">
                      <div className="truncate" title={`${container.composeProject}${container.composeService ? ` / ${container.composeService}` : ""}`}>
                        项目：{container.composeProject}{container.composeService ? ` / ${container.composeService}` : ""}
                      </div>
                      {container.composeWorkingDir && (
                        <div className="truncate font-mono" title={container.composeWorkingDir}>目录：{container.composeWorkingDir}</div>
                      )}
                      {container.composeConfigFiles.length > 0 && (
                        <div className="truncate font-mono" title={container.composeConfigFiles.join(", ")}>文件：{container.composeConfigFiles.join(", ")}</div>
                      )}
                    </div>
                  )}
                  <div className="mt-1 text-gray-400">{container.status}</div>
                  {container.ports && <div className="truncate text-gray-400" title={container.ports}>{container.ports}</div>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {container.composeWorkingDir && (
                      <button onClick={() => openInExplorer(container.composeWorkingDir!)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200" title="打开 compose 目录">
                        <FolderOpen size={12} />
                      </button>
                    )}
                    {container.composeConfigFiles[0] && (
                      <button onClick={() => openInEditor(container.composeConfigFiles[0])} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-purple-50 text-purple-600 hover:bg-purple-100" title="打开 compose YAML">
                        <FileText size={12} />
                      </button>
                    )}
                    <button onClick={() => actions.inspectContainerConfig(container.id, container.names || container.id)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100" title="查看配置 YAML">
                      <FileText size={12} />
                    </button>
                    {isRunning ? (
                      <>
                        <button onClick={() => actions.restartContainer(container.id)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100" title="重启">
                          <RotateCw size={12} />
                        </button>
                        <button onClick={() => actions.stopContainer(container.id)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-orange-50 text-orange-600 hover:bg-orange-100" title="停止">
                          <Square size={12} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => actions.startContainer(container.id)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-green-50 text-green-600 hover:bg-green-100" title="启动">
                        <Play size={12} />
                      </button>
                    )}
                    <button onClick={() => actions.removeContainer(container.id)} className="inline-flex h-7 w-8 items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-100" title="删除">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
            {state.containers.length === 0 && <div className="py-8 text-center text-xs text-gray-400">暂无容器</div>}
          </>
        )}
      </div>
    </div>
  );
}
