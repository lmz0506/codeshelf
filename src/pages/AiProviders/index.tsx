import { useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { AiProviderSettings, type AiProviderSettingsHandle } from "@/pages/Settings/AiProviderSettings";
import { useAppStore } from "@/stores/appStore";
import { MacWindowControls } from "@/components/layout/MacWindowControls";
import { ChatOverlay } from "./components/ChatOverlay";

export function AiProvidersPage() {
  const { aiProviders, ensureAiDefaultProvider, sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [showChat, setShowChat] = useState(false);
  const settingsRef = useRef<AiProviderSettingsHandle | null>(null);

  const normalized = useMemo(() => ensureAiDefaultProvider(aiProviders), [aiProviders, ensureAiDefaultProvider]);

  return (
    <div className="flex flex-col min-h-full">
      <header className="re-header sticky top-0 z-20" data-tauri-drag-region>
        <span
          className="toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          ☰
        </span>
        <div className="flex flex-col" data-tauri-drag-region>
          <span className="text-lg font-semibold ml-2">✨ AI模型</span>
          <span className="text-xs text-gray-500 ml-2">统一管理 OpenAI 兼容的 AI 厂商与模型配置</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
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
          <MacWindowControls />
        </div>
      </header>

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
