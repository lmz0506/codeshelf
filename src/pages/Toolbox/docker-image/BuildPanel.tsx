import { FileCode, Package } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface BuildPanelProps {
  model: DockerImageToolModel;
}

export function BuildPanel({ model }: BuildPanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Package size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-900">构建镜像</div>
            <div className="truncate font-mono text-xs text-gray-400">{state.fullImageName || "image:tag"}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_150px_118px]">
            <Input
              value={state.imageName}
              onChange={(e) => setters.setImageName(e.target.value)}
              placeholder="镜像名，如 my-app"
              className="h-8 py-1.5 font-mono text-sm"
            />
            <Input
              value={state.imageTag}
              onChange={(e) => setters.setImageTag(e.target.value)}
              placeholder="tag，如 latest"
              className="h-8 py-1.5 font-mono text-sm"
            />
            <label className="flex h-8 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={state.noCache}
                onChange={(e) => setters.setNoCache(e.target.checked)}
              />
              不用缓存
            </label>
          </div>
        </div>
        <Button onClick={actions.buildImage} disabled={state.busy || !state.status?.available} variant="primary" size="sm">
          <FileCode size={15} className="mr-1.5" />
          {state.busy ? "执行中" : "构建"}
        </Button>
      </div>
    </div>
  );
}
