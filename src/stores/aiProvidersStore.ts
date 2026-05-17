import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { AiProviderConfig } from "@/types";

interface AiProvidersState {
  aiProviders: AiProviderConfig[];
  setAiProviders: (providers: AiProviderConfig[]) => void;
  saveAiProviders: (providers: AiProviderConfig[]) => Promise<void>;
  ensureAiDefaultProvider: (
    providers: AiProviderConfig[]
  ) => AiProviderConfig[];
}

export const useAiProvidersStore = create<AiProvidersState>()((set, get) => ({
  aiProviders: [],
  setAiProviders: (aiProviders) => set({ aiProviders }),
  ensureAiDefaultProvider: (providers) => {
    const hasDefault = providers.some(
      (p) => p.isDefaultProvider && p.enabled
    );
    if (hasDefault || providers.length === 0) {
      return providers;
    }
    const firstEnabled = providers.find((p) => p.enabled);
    if (!firstEnabled) {
      return providers;
    }
    return providers.map((p) => ({
      ...p,
      isDefaultProvider: p.id === firstEnabled.id,
    }));
  },
  saveAiProviders: async (providers) => {
    const normalized = get().ensureAiDefaultProvider(providers);
    set({ aiProviders: normalized });
    try {
      await invoke("save_ai_providers", { providers: normalized });
    } catch (err) {
      console.error("保存 AI 供应商配置失败:", err);
    }
  },
}));
