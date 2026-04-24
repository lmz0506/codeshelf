import { FileCode } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface BuildPanelProps {
  model: DockerImageToolModel;
}

export function BuildPanel({ model }: BuildPanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">构建镜像</div>
          <div className="text-xs text-gray-400 mt-0.5">{state.fullImageName || "设置镜像名称和 tag"}</div>
        </div>
        <Button onClick={actions.buildImage} disabled={state.busy || !state.status?.available} variant="primary" size="sm">
          <FileCode size={15} className="mr-1.5" />
          {state.busy ? "执行中" : "构建"}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_120px] gap-2">
        <Input
          value={state.imageName}
          onChange={(e) => setters.setImageName(e.target.value)}
          placeholder="镜像名，如 my-app"
          className="h-9 py-1.5 font-mono text-sm"
        />
        <Input
          value={state.imageTag}
          onChange={(e) => setters.setImageTag(e.target.value)}
          placeholder="tag，如 latest"
          className="h-9 py-1.5 font-mono text-sm"
        />
        <label className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={state.noCache}
            onChange={(e) => setters.setNoCache(e.target.checked)}
          />
          不使用缓存
        </label>
      </div>
    </div>
  );
}
