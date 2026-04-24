import { FileCode } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface BuildPanelProps {
  model: DockerImageToolModel;
}

export function BuildPanel({ model }: BuildPanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="re-card p-4 space-y-3">
      <div className="text-sm font-semibold">构建镜像</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input
          value={state.imageName}
          onChange={(e) => setters.setImageName(e.target.value)}
          placeholder="镜像名，如 my-app"
        />
        <Input
          value={state.imageTag}
          onChange={(e) => setters.setImageTag(e.target.value)}
          placeholder="tag，如 latest"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={state.noCache}
            onChange={(e) => setters.setNoCache(e.target.checked)}
          />
          不使用缓存
        </label>
      </div>
      <Button onClick={actions.buildImage} disabled={state.busy || !state.status?.available} variant="primary">
        <FileCode size={16} className="mr-2" />
        {state.busy ? "执行中..." : `构建 ${state.fullImageName || "镜像"}`}
      </Button>
    </div>
  );
}
