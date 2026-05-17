import { useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { AiProviderSettings, type AiProviderSettingsHandle } from "@/pages/Settings/AiProviderSettings";
import { useAiProvidersStore } from "@/stores/aiProvidersStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PageHeader } from "@/components/common";
import { ChatOverlay } from "./components/ChatOverlay";

export function AiProvidersPage() {
  const { aiProviders, ensureAiDefaultProvider } = useAiProvidersStore();
  const { sidebarCollapsed, setSidebarCollapsed } = useSettingsStore();
  const [showChat, setShowChat] = useState(false);
  const settingsRef = useRef<AiProviderSettingsHandle | null>(null);

  const normalized = useMemo(() => ensureAiDefaultProvider(aiProviders), [aiProviders, ensureAiDefaultProvider]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="✨ AI模型"
        subtitle="统一管理 OpenAI 兼容的 AI 厂商与模型配置"
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        actions={
          <>
            <button
              className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
              onClick={() => settingsRef.current?.openHistoryModal()}
            >
              会话历史路径
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600"
              onClick={() => settingsRef.current?.openCreateDrawer()}
            >
              新增供应商
            </button>
          </>
        }
      />

      <div className="p-5" style={{ marginTop: "0px" }}>
        <AiProviderSettings ref={settingsRef} />
      </div>

      <button
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-500 text-white shadow-lg flex items-center justify-center"
        onClick={() => setShowChat(true)}
        title="验证聊天"
      >
        <MessageSquare size={18} />
      </button>

      {showChat && (
        <ChatOverlay
          providers={normalized}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
