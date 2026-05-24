import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ViewMode, AppShortcutBinding } from "@/types";
import { saveAppSettings } from "./_persistence";

export type Theme = "light" | "dark";

interface SettingsState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  scanDepth: number;
  setScanDepth: (depth: number) => void;

  chatHistoryDir?: string;
  setChatHistoryDir: (dir?: string) => void;

  autoUpdate: boolean;
  setAutoUpdate: (autoUpdate: boolean) => void;

  showDockIcon: boolean;
  setShowDockIcon: (show: boolean) => void;

  appShortcuts: AppShortcutBinding[];
  setAppShortcuts: (shortcuts: AppShortcutBinding[]) => void;

  sensitiveFilePatterns: string[];
  setSensitiveFilePatterns: (patterns: string[]) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  viewMode: "grid",
  setViewMode: (viewMode) => {
    set({ viewMode });
    saveAppSettings({ view_mode: viewMode });
  },

  theme: "light",
  setTheme: (theme) => {
    set({ theme });
    saveAppSettings({ theme });
  },

  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed });
    saveAppSettings({ sidebar_collapsed: sidebarCollapsed });
  },

  scanDepth: 3,
  setScanDepth: (scanDepth) => {
    set({ scanDepth });
    saveAppSettings({ scan_depth: scanDepth });
  },

  chatHistoryDir: undefined,
  setChatHistoryDir: (chatHistoryDir) => {
    set({ chatHistoryDir });
    saveAppSettings({ chat_history_dir: chatHistoryDir });
  },

  autoUpdate: true,
  setAutoUpdate: (autoUpdate) => {
    set({ autoUpdate });
    saveAppSettings({ auto_update: autoUpdate });
  },

  showDockIcon: false,
  setShowDockIcon: (showDockIcon) => {
    set({ showDockIcon });
    saveAppSettings({ show_dock_icon: showDockIcon });
  },

  appShortcuts: [],
  setAppShortcuts: (appShortcuts) => set({ appShortcuts }),

  sensitiveFilePatterns: [],
  setSensitiveFilePatterns: (sensitiveFilePatterns) => {
    set({ sensitiveFilePatterns });
    invoke("save_sensitive_file_patterns", {
      patterns: sensitiveFilePatterns,
    }).catch(console.error);
  },
}));
