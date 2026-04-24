import { FileCode, Globe, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { ToolPanelHeader } from "./index";
import { DeleteConfirmDialog } from "./local-service/DeleteConfirmDialog";
import { NginxConfigDialog } from "./local-service/NginxConfigDialog";
import { ServiceFormDialog } from "./local-service/ServiceFormDialog";
import { ServiceList } from "./local-service/ServiceList";
import type { TabType } from "./local-service/types";
import { useLocalService } from "./local-service/useLocalService";

interface LocalServiceProps {
  onBack: () => void;
}

const TABS: Array<{ id: TabType; label: string }> = [
  { id: "all", label: "全部" },
  { id: "web", label: "Web 服务" },
  { id: "forward", label: "端口转发" },
];

export function LocalService({ onBack }: LocalServiceProps) {
  const service = useLocalService();

  function tabCount(tab: TabType): number {
    if (tab === "web") return service.servers.length;
    if (tab === "forward") return service.forwardRules.length;
    return service.servers.length + service.forwardRules.length;
  }

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="本地服务"
        icon={Globe}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={service.loadAll} disabled={service.loading} variant="secondary" size="sm">
              <RefreshCw size={16} className={service.loading ? "animate-spin mr-2" : "mr-2"} />
              刷新
            </Button>
            <Button onClick={service.openCreateDialog} variant="primary" size="sm">
              <Plus size={16} className="mr-2" />
              创建服务
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => service.setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    service.activeTab === tab.id
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {tab.label} ({tabCount(tab.id)})
                </button>
              ))}
            </div>
            <Button onClick={service.handleOpenNginxManual} variant="secondary" size="sm">
              <FileCode size={16} className="mr-2" />
              nginx 手册
            </Button>
          </div>

          {service.loading && service.servers.length === 0 && service.forwardRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 size={32} className="animate-spin mb-4" />
              <p>加载中...</p>
            </div>
          ) : service.filteredServers.length === 0 && service.filteredRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Globe size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">暂无服务</p>
              <p className="text-sm mb-4">点击"创建服务"添加 Web 服务或端口转发</p>
              <Button onClick={service.openCreateDialog} variant="primary">
                <Plus size={16} className="mr-2" />
                创建服务
              </Button>
            </div>
          ) : (
            <ServiceList
              servers={service.filteredServers}
              rules={service.filteredRules}
              copiedId={service.copiedId}
              callbacks={service.serviceListCallbacks}
            />
          )}
        </div>
      </div>

      {service.showAddDialog && <ServiceFormDialog {...service.serviceFormProps} />}
      {service.nginxDialogProps && <NginxConfigDialog {...service.nginxDialogProps} />}
      {service.deleteDialogProps && <DeleteConfirmDialog {...service.deleteDialogProps} />}
    </div>
  );
}
