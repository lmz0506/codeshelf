import { Box, FolderOpen, RefreshCw } from "lucide-react";
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
    <div className="flex flex-col min-h-full">
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

      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="re-card p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Docker 状态</div>
              <div className={`text-xs mt-1 truncate ${state.status?.available ? "text-green-600" : "text-red-500"}`}>
                {state.status?.available ? state.status.version : state.status?.error || "检测中..."}
              </div>
              {state.projectPath && (
                <div className="text-xs text-gray-400 mt-1 truncate" title={state.projectPath}>
                  {state.projectPath}
                </div>
              )}
            </div>
            <Button onClick={actions.selectProject} variant="primary">
              <FolderOpen size={16} className="mr-2" />
              选择项目
            </Button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
            <div className="space-y-4">
              <DockerfilePanel model={model} />
              <BuildPanel model={model} />
              <CommandResultPanel result={state.lastResult} />
            </div>

            <div className="space-y-4">
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
