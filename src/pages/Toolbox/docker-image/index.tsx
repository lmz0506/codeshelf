import { Box, CheckCircle2, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { ToolPanelHeader } from "../index";
import { BuildPanel } from "./BuildPanel";
import { CommandResultPanel } from "./CommandResultPanel";
import { ContainerListPanel } from "./ContainerListPanel";
import { DockerfilePanel } from "./DockerfilePanel";
import { ImageListPanel } from "./ImageListPanel";
import { RunPanel } from "./RunPanel";
import { useDockerImageTool } from "./useDockerImageTool";

interface DockerImageToolProps {
  onBack: () => void;
  initialProjectPath?: string;
  initialProjectName?: string;
  onInitialProjectConsumed?: () => void;
}

export function DockerImageTool({
  onBack,
  initialProjectPath,
  initialProjectName,
  onInitialProjectConsumed,
}: DockerImageToolProps) {
  const model = useDockerImageTool({ initialProjectPath, initialProjectName, onInitialProjectConsumed });
  const { state, actions } = model;

  return (
    <div className="flex flex-col min-h-full bg-gray-50/60">
      <ToolPanelHeader
        title="Docker 镜像"
        icon={Box}
        onBack={onBack}
        actions={
          <Button onClick={actions.refreshDocker} variant="secondary" size="sm">
            <RefreshCw size={16} className="mr-2" />
            刷新
          </Button>
        }
      />

      <div className="flex-1 p-4 lg:p-5 overflow-auto">
        <div className="mx-auto max-w-[1500px] space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${state.status?.available ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  <CheckCircle2 size={17} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Docker</span>
                    <span className={`text-xs ${state.status?.available ? "text-green-600" : "text-red-500"}`}>
                      {state.status?.available ? "可用" : "未就绪"}
                    </span>
                    {state.platform && <span className="text-xs text-gray-400">{state.platform}</span>}
                  </div>
                  <div className={`text-xs mt-0.5 truncate ${state.status?.available ? "text-gray-500" : "text-red-500"}`}>
                    {state.status?.available ? state.status.version : state.status?.error || "检测中..."}
                  </div>
                </div>
              </div>
              <Button onClick={actions.selectProject} variant="primary" size="sm">
                <FolderOpen size={15} className="mr-1.5" />
                选择项目
              </Button>
            </div>
            {state.projectPath && (
              <div className="mt-3 truncate rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500" title={state.projectPath}>
                {state.projectPath}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(720px,1fr)_340px] gap-4 items-start">
            <div className="space-y-3 min-w-0">
              <DockerfilePanel model={model} />
              <BuildPanel model={model} />
              <CommandResultPanel result={state.lastResult} />
            </div>

            <div className="space-y-3 min-w-0">
              <RunPanel model={model} />
              <ImageListPanel model={model} />
              <ContainerListPanel model={model} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
