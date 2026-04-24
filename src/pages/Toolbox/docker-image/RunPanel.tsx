import { Play } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface RunPanelProps {
  model: DockerImageToolModel;
}

export function RunPanel({ model }: RunPanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">运行镜像</div>
          <div className="text-xs text-gray-400 mt-0.5">docker run -d</div>
        </div>
        <Button onClick={() => actions.runSelectedImage()} disabled={state.busy || !state.status?.available} variant="primary" size="sm">
          <Play size={15} className="mr-1.5" />
          运行
        </Button>
      </div>
      <Input
        value={state.runImage}
        onChange={(e) => setters.setRunImage(e.target.value)}
        placeholder="镜像，如 my-app:latest"
        className="h-9 py-1.5 font-mono text-sm"
      />
      <Input
        value={state.containerName}
        onChange={(e) => setters.setContainerName(e.target.value)}
        placeholder="容器名（可选）"
        className="h-9 py-1.5 text-sm"
      />
      <Input
        value={state.portsText}
        onChange={(e) => setters.setPortsText(e.target.value)}
        placeholder="端口映射，如 8080:80，多条用逗号/换行"
        className="h-9 py-1.5 font-mono text-sm"
      />
      <textarea
        value={state.envText}
        onChange={(e) => setters.setEnvText(e.target.value)}
        className="w-full h-20 rounded-lg border border-gray-200 p-2 text-xs outline-none hover:border-gray-300 focus:border-blue-400"
        placeholder="环境变量，如 NODE_ENV=production，多条用逗号/换行"
      />
    </div>
  );
}
