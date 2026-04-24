import { Play } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface RunPanelProps {
  model: DockerImageToolModel;
}

export function RunPanel({ model }: RunPanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="re-card p-4 space-y-3">
      <div className="text-sm font-semibold">在线运行镜像</div>
      <Input value={state.runImage} onChange={(e) => setters.setRunImage(e.target.value)} placeholder="镜像，如 my-app:latest" />
      <Input value={state.containerName} onChange={(e) => setters.setContainerName(e.target.value)} placeholder="容器名（可选）" />
      <Input
        value={state.portsText}
        onChange={(e) => setters.setPortsText(e.target.value)}
        placeholder="端口映射，如 8080:80，多条用逗号/换行"
      />
      <textarea
        value={state.envText}
        onChange={(e) => setters.setEnvText(e.target.value)}
        className="w-full h-20 border border-gray-200 rounded p-2 text-xs"
        placeholder="环境变量，如 NODE_ENV=production，多条用逗号/换行"
      />
      <Button onClick={() => actions.runSelectedImage()} disabled={state.busy || !state.status?.available} variant="primary">
        <Play size={16} className="mr-2" />
        运行
      </Button>
    </div>
  );
}
