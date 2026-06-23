import { Box, CheckCircle2, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { ToolPanelHeader } from "../index";
import { BuildPanel } from "./BuildPanel";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { ContainerConfigDialog } from "./ContainerConfigDialog";
import { CommandResultPanel } from "./CommandResultPanel";
import { DockerfilePanel } from "./DockerfilePanel";
import { ResourcePanel } from "./ResourcePanel";
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
    <div className="flex h-full min-h-0 flex-col bg-[#f6f8fb]">
      <ToolPanelHeader
        title="Docker 镜像"
        icon={Box}
        onBack={onBack}
        actions={
          <Button
            onClick={actions.refreshDocker}
            disabled={state.refreshing}
            variant="secondary"
            size="sm"
          >
            <RefreshCw
              size={16}
              className={`mr-2 ${state.refreshing ? "animate-spin" : ""}`}
            />
            {state.refreshing ? "刷新中..." : "刷新"}
          </Button>
        }
      />

      <div className="flex-1 min-h-0 overflow-hidden px-5 py-4">
        <div className="mx-auto flex h-full max-w-[1480px] flex-col gap-3">
          <div className="rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${state.status?.available ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  <CheckCircle2 size={17} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Docker 工作区</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${state.status?.available ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
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
              <div className="mt-3 truncate rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500" title={state.projectPath}>
                {state.projectPath}
              </div>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-0 flex-col gap-3">
              <BuildPanel model={model} />
              <DockerfilePanel model={model} />
              <CommandResultPanel result={state.lastResult} />
            </div>

            <div className="min-h-0 space-y-3 overflow-auto pr-1">
              <ResourcePanel model={model} />
            </div>
          </div>
          <RunPanel model={model} />
          <ContainerConfigDialog model={model} />
          <ConfirmActionDialog model={model} />
        </div>
      </div>
    </div>
  );
}
