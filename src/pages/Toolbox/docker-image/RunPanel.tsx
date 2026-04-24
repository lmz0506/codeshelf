import { Copy, Play, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";
import { buildComposeYaml, buildDockerRunCommand, splitListText } from "./utils";

interface RunPanelProps {
  model: DockerImageToolModel;
}

export function RunPanel({ model }: RunPanelProps) {
  const { state, setters, actions } = model;
  if (!state.runDialogOpen) return null;
  const runInput = {
    image: state.runImage,
    containerName: state.containerName.trim() || undefined,
    ports: splitListText(state.portsText),
    env: splitListText(state.envText),
    volumes: splitListText(state.volumesText),
    network: state.network.trim() || undefined,
    restart: state.restart.trim() || undefined,
    user: state.user.trim() || undefined,
    workdir: state.workdir.trim() || undefined,
    command: state.command.trim() || undefined,
    privileged: state.privileged,
    readOnly: state.readOnly,
    extraArgs: splitListText(state.extraArgsText),
  };
  const runCommand = buildDockerRunCommand(runInput);
  const composeYaml = buildComposeYaml(runInput);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">运行镜像</div>
            <div className="mt-0.5 font-mono text-xs text-gray-400">docker run -d</div>
          </div>
          <button
            onClick={() => setters.setRunDialogOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="镜像" value={state.runImage} onChange={(e) => setters.setRunImage(e.target.value)} placeholder="my-app:latest" className="font-mono text-sm" />
              <Input label="容器名" value={state.containerName} onChange={(e) => setters.setContainerName(e.target.value)} placeholder="可选" className="text-sm" />
              <Input label="端口映射" value={state.portsText} onChange={(e) => setters.setPortsText(e.target.value)} placeholder="8080:80，多条用逗号/换行" className="font-mono text-sm" />
              <Input label="挂载目录" value={state.volumesText} onChange={(e) => setters.setVolumesText(e.target.value)} placeholder="/host:/container:ro，多条用逗号/换行" className="font-mono text-sm" />
              <Input label="网络" value={state.network} onChange={(e) => setters.setNetwork(e.target.value)} placeholder="bridge / host / 网络名" className="font-mono text-sm" />
              <select
                value={state.restart}
                onChange={(e) => setters.setRestart(e.target.value)}
                className="mt-7 h-[42px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none hover:border-gray-300 focus:border-blue-400"
              >
                <option value="">重启策略：不设置</option>
                <option value="no">no</option>
                <option value="always">always</option>
                <option value="unless-stopped">unless-stopped</option>
                <option value="on-failure">on-failure</option>
              </select>
              <Input label="用户/权限" value={state.user} onChange={(e) => setters.setUser(e.target.value)} placeholder="1000:1000 / root" className="font-mono text-sm" />
              <Input label="工作目录" value={state.workdir} onChange={(e) => setters.setWorkdir(e.target.value)} placeholder="/app" className="font-mono text-sm" />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-500">环境变量</label>
                <textarea value={state.envText} onChange={(e) => setters.setEnvText(e.target.value)} className="h-24 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none hover:border-gray-300 focus:border-blue-400" placeholder="NODE_ENV=production，多条用逗号/换行" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-500">启动命令</label>
                <textarea value={state.command} onChange={(e) => setters.setCommand(e.target.value)} className="h-24 w-full rounded-lg border border-gray-200 p-3 font-mono text-sm outline-none hover:border-gray-300 focus:border-blue-400" placeholder="覆盖镜像 CMD，如 npm start" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-500">额外 docker run 参数</label>
              <Input value={state.extraArgsText} onChange={(e) => setters.setExtraArgsText(e.target.value)} placeholder="--add-host host.docker.internal:host-gateway，多条用逗号/换行" className="font-mono text-sm" />
            </div>

            <div className="flex flex-wrap gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={state.privileged} onChange={(e) => setters.setPrivileged(e.target.checked)} />
                privileged
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={state.readOnly} onChange={(e) => setters.setReadOnly(e.target.checked)} />
                read-only
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">docker run 命令</span>
                <Button onClick={() => navigator.clipboard.writeText(runCommand)} variant="secondary" size="sm">
                  <Copy size={14} className="mr-1.5" />
                  复制
                </Button>
              </div>
              <pre className="max-h-36 overflow-auto rounded-lg bg-gray-950 p-3 text-xs leading-5 text-gray-100 whitespace-pre-wrap">{runCommand}</pre>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">docker-compose.yml</span>
                <Button onClick={() => navigator.clipboard.writeText(composeYaml)} variant="secondary" size="sm">
                  <Copy size={14} className="mr-1.5" />
                  复制
                </Button>
              </div>
              <pre className="max-h-[330px] overflow-auto rounded-lg bg-gray-950 p-3 text-xs leading-5 text-gray-100">{composeYaml}</pre>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <Button onClick={() => setters.setRunDialogOpen(false)} variant="secondary" size="sm">
            取消
          </Button>
          <Button
            onClick={async () => {
              await actions.runSelectedImage();
              setters.setRunDialogOpen(false);
            }}
            disabled={state.busy || !state.status?.available}
            variant="primary"
            size="sm"
          >
            <Play size={15} className="mr-1.5" />
            运行
          </Button>
        </div>
      </div>
    </div>
  );
}
