import { FileDown, FileUp, Network, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { LoadingSpinner } from "@/components/common";
import { ToolPanelHeader } from "./index";
import { DeleteConfirmDialog } from "./ssh-tunnel/DeleteConfirmDialog";
import { TestResultDialog } from "./ssh-tunnel/TestResultDialog";
import { TunnelFormDialog } from "./ssh-tunnel/TunnelFormDialog";
import { TunnelList } from "./ssh-tunnel/TunnelList";
import { useSshTunnel } from "./ssh-tunnel/useSshTunnel";

interface SshTunnelProps {
  onBack: () => void;
}

export function SshTunnel({ onBack }: SshTunnelProps) {
  const tunnel = useSshTunnel();

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="SSH 隧道"
        icon={Network}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={tunnel.handleImport} variant="secondary" size="sm">
              <FileUp size={16} className="mr-2" />
              导入
            </Button>
            <Button onClick={tunnel.handleExport} variant="secondary" size="sm">
              <FileDown size={16} className="mr-2" />
              导出
            </Button>
            <Button onClick={tunnel.loadAll} disabled={tunnel.loading} variant="secondary" size="sm">
              <RefreshCw size={16} className={tunnel.loading ? "animate-spin mr-2" : "mr-2"} />
              刷新
            </Button>
            <Button onClick={tunnel.openCreateDialog} variant="primary" size="sm">
              <Plus size={16} className="mr-2" />
              新建隧道
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {tunnel.loading && tunnel.tunnels.length === 0 ? (
            <LoadingSpinner size={32} label="加载中..." className="py-20" />
          ) : tunnel.tunnels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Network size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">暂无 SSH 隧道</p>
              <p className="text-sm mb-4">
                通过 SSH 将远程机器上的端口（如 Redis、MySQL）映射到本地
              </p>
              <Button onClick={tunnel.openCreateDialog} variant="primary">
                <Plus size={16} className="mr-2" />
                新建隧道
              </Button>
            </div>
          ) : (
            <TunnelList
              tunnels={tunnel.tunnels}
              copiedId={tunnel.copiedId}
              groups={tunnel.groups}
              callbacks={tunnel.listCallbacks}
            />
          )}
        </div>
      </div>

      {tunnel.showAddDialog && <TunnelFormDialog {...tunnel.formProps} />}
      {tunnel.deleteDialogProps && <DeleteConfirmDialog {...tunnel.deleteDialogProps} />}
      {tunnel.testState && (
        <TestResultDialog state={tunnel.testState} onDismiss={tunnel.dismissTest} />
      )}
    </div>
  );
}
