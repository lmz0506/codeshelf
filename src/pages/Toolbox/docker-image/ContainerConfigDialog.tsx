import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface ContainerConfigDialogProps {
  model: DockerImageToolModel;
}

export function ContainerConfigDialog({ model }: ContainerConfigDialogProps) {
  const { state, setters } = model;
  if (!state.containerConfigOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">容器配置 YAML</div>
            <div className="mt-0.5 font-mono text-xs text-gray-400">{state.containerConfigName}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigator.clipboard.writeText(state.containerConfigYaml)} variant="secondary" size="sm">
              <Copy size={14} className="mr-1.5" />
              复制
            </Button>
            <button
              onClick={() => setters.setContainerConfigOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <pre className="m-4 flex-1 overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
          {state.containerConfigYaml}
        </pre>
      </div>
    </div>
  );
}
