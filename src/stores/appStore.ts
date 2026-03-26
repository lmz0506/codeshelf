import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Project, ViewMode, Notification, AppShortcutBinding, AiProviderConfig } from "@/types";
import type { ToolType } from "@/types/toolbox";
import { markProjectDirty as markDirty } from "@/services/stats";
import { setProjectEditor as setProjectEditorApi, setProjectClaudeEnv as setProjectClaudeEnvApi } from "@/services/db";

export type Theme = "light" | "dark";

export interface EditorConfig {
  id: string;
  name: string;
  path: string;
  icon?: string;
  is_default?: boolean;
}

export interface TerminalConfig {
  type: "default" | "powershell" | "cmd" | "terminal" | "iterm" | "custom";
  customPath?: string;
  // 存储各终端类型的自定义路径（当自动检测失败时使用）
  paths?: {
    powershell?: string;
    cmd?: string;
    terminal?: string;
    iterm?: string;
    default?: string;
    custom?: string;
  };
}

export type PageType = "shelf" | "dashboard" | "settings" | "toolbox" | "aiProviders";

interface AppState {
  // Initialization
  initialized: boolean;
  setInitialized: (initialized: boolean) => void;

  // Projects
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  setProjectEditor: (projectId: string, editorId: string | null) => void;
  setProjectClaudeEnv: (projectId: string, claudeEnvName: string | null) => void;

  // Recent Detail Projects (最近打开详情的项目)
  recentDetailProjectIds: string[];
  addRecentDetailProject: (projectId: string) => void;

  // Stats - mark project as dirty for incremental refresh
  markProjectDirty: (projectPath: string) => void;

  // Navigation
  currentPage: PageType;
  setCurrentPage: (page: PageType) => void;
  navigateToProject: (projectPath: string) => void;

  // UI State
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Settings
  scanDepth: number;
  setScanDepth: (depth: number) => void;
  chatHistoryDir?: string;
  setChatHistoryDir: (dir?: string) => void;

  // Categories (项目分类)
  categories: string[];
  setCategories: (categories: string[]) => void;
  addCategory: (category: string) => void;
  removeCategory: (category: string) => void;

  // Labels (技术栈标签)
  labels: string[];
  setLabels: (labels: string[]) => void;
  addLabel: (label: string) => void;
  removeLabel: (label: string) => void;

  // Editor Settings
  editors: EditorConfig[];
  setEditors: (editors: EditorConfig[]) => void;
  addEditor: (editor: EditorConfig) => void;
  removeEditor: (id: string) => void;
  updateEditor: (id: string, updates: Partial<EditorConfig>) => void;
  setDefaultEditor: (id: string) => void;

  // Terminal Settings
  terminalConfig: TerminalConfig;
  setTerminalConfig: (config: TerminalConfig) => void;

  // Notifications (消息通知)
  notifications: Notification[];
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Omit<Notification, "id" | "createdAt">) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;

  // App Shortcuts (应用快捷键)
  appShortcuts: AppShortcutBinding[];
  setAppShortcuts: (shortcuts: AppShortcutBinding[]) => void;

  // Auto Update (自动更新)
  autoUpdate: boolean;
  setAutoUpdate: (autoUpdate: boolean) => void;

  // AI Providers (AI 供应商)
  aiProviders: AiProviderConfig[];
  setAiProviders: (providers: AiProviderConfig[]) => void;
  saveAiProviders: (providers: AiProviderConfig[]) => Promise<void>;
  ensureAiDefaultProvider: (providers: AiProviderConfig[]) => AiProviderConfig[];

  // Shortcut Quick Lookup (快捷键快速查找弹窗)
  showShortcutQuickLookup: boolean;
  toggleShortcutQuickLookup: () => void;

  // Clipboard Quick Access (剪贴板快速访问弹窗)
  showClipboardQuickAccess: boolean;
  toggleClipboardQuickAccess: () => void;

  // 弹窗关闭时是否自动隐藏窗口（全局快捷键从隐藏状态唤起时设为 true）
  popupAutoHideWindow: boolean;
  setPopupAutoHideWindow: (v: boolean) => void;

  // Toolbox Navigation Target (从外部快捷键导航到工具箱子工具)
  toolboxNavigateTarget: ToolType | null;
  navigateToTool: (tool: ToolType) => void;
  clearToolboxNavigateTarget: () => void;
}

// 防抖保存辅助函数
const debounce = <T extends unknown[]>(fn: (...args: T) => void, delay: number) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// 后端同步辅助函数
const saveAppSettings = debounce(async (settings: {
  theme?: string;
  view_mode?: string;
  sidebar_collapsed?: boolean;
  scan_depth?: number;
  auto_update?: boolean;
  chat_history_dir?: string;
}) => {
  try {
    await invoke("save_app_settings", { input: settings });
  } catch (err) {
    console.error("保存应用设置失败:", err);
  }
}, 300);

const saveUiState = debounce(async (state: { recent_detail_project_ids?: string[] }) => {
  try {
    await invoke("save_ui_state", { input: state });
  } catch (err) {
    console.error("保存UI状态失败:", err);
  }
}, 300);

export const useAppStore = create<AppState>()((set, get) => ({
  // Initialization
  initialized: false,
  setInitialized: (initialized) => set({ initialized }),

  // Projects
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    })),
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),
  setProjectEditor: (projectId, editorId) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, editorId: editorId ?? undefined } : p
      ),
    }));
    setProjectEditorApi(projectId, editorId).catch(console.error);
  },
  setProjectClaudeEnv: (projectId, claudeEnvName) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, claudeEnvName: claudeEnvName ?? undefined } : p
      ),
    }));
    setProjectClaudeEnvApi(projectId, claudeEnvName).catch(console.error);
  },

  // Recent Detail Projects (最近打开详情的项目，最多保留9个)
  recentDetailProjectIds: [],
  addRecentDetailProject: (projectId) => {
    set((state) => {
      const filtered = state.recentDetailProjectIds.filter((id) => id !== projectId);
      const updated = [projectId, ...filtered].slice(0, 9);
      // 同步到后端
      saveUiState({ recent_detail_project_ids: updated });
      return { recentDetailProjectIds: updated };
    });
  },

  // Stats - mark project as dirty (calls Rust command)
  markProjectDirty: (projectPath) => {
    markDirty(projectPath).catch(console.error);
  },

  // Navigation
  currentPage: "shelf",
  setCurrentPage: (currentPage) => set({ currentPage }),
  navigateToProject: (projectPath) => set((state) => {
    const project = state.projects.find((p) => p.path === projectPath);
    if (project) {
      return { currentPage: "shelf" as PageType, selectedProjectId: project.id };
    }
    return { currentPage: "shelf" as PageType };
  }),

  // UI State
  viewMode: "grid",
  setViewMode: (viewMode) => {
    set({ viewMode });
    saveAppSettings({ view_mode: viewMode });
  },
  selectedProjectId: null,
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  selectedTags: [],
  setSelectedTags: (selectedTags) => set({ selectedTags }),

  // Theme
  theme: "light",
  setTheme: (theme) => {
    set({ theme });
    saveAppSettings({ theme });
  },

  // Sidebar
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed });
    saveAppSettings({ sidebar_collapsed: sidebarCollapsed });
  },

  // Settings
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

  // Categories (项目分类)
  categories: [],
  setCategories: (categories) => {
    set({ categories });
    invoke("save_categories", { categories }).catch(console.error);
  },
  addCategory: (category) => {
    const state = get();
    if (!state.categories.includes(category)) {
      const updated = [...state.categories, category];
      set({ categories: updated });
      invoke("save_categories", { categories: updated }).catch(console.error);
    }
  },
  removeCategory: (category) => {
    const state = get();
    const updated = state.categories.filter((c) => c !== category);
    set({
      categories: updated,
      projects: state.projects.map((p) => ({
        ...p,
        tags: p.tags.filter((t) => t !== category),
      })),
    });
    invoke("save_categories", { categories: updated }).catch(console.error);
  },

  // Labels (技术栈标签)
  labels: ["Java", "Python", "JavaScript", "TypeScript", "React", "Vue", "Node.js", "Go", "Rust", "Spring Boot"],
  setLabels: (labels) => set({ labels }),
  addLabel: (label) => {
    const state = get();
    if (!state.labels.includes(label)) {
      const updated = [...state.labels, label];
      set({ labels: updated });
      invoke("save_labels", { labels: updated }).catch(console.error);
    }
  },
  removeLabel: (label) => {
    const state = get();
    const updated = state.labels.filter((l) => l !== label);
    set({
      labels: updated,
      projects: state.projects.map((p) => ({
        ...p,
        labels: p.labels?.filter((l) => l !== label),
      })),
    });
    invoke("save_labels", { labels: updated }).catch(console.error);
  },

  // Editor Settings
  editors: [],
  setEditors: (editors) => set({ editors }),
  addEditor: (editor) => {
    set((state) => ({ editors: [...state.editors, editor] }));
    invoke("add_editor", {
      input: {
        name: editor.name,
        path: editor.path,
        icon: editor.icon,
        is_default: false,
      }
    }).then((editors: unknown) => {
      set({ editors: editors as EditorConfig[] });
    }).catch(console.error);
  },
  removeEditor: (id) => {
    set((state) => ({
      editors: state.editors.filter((e) => e.id !== id),
    }));
    invoke("remove_editor", { id }).then((editors: unknown) => {
      set({ editors: editors as EditorConfig[] });
    }).catch(console.error);
  },
  updateEditor: (id, updates) => {
    set((state) => ({
      editors: state.editors.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    }));
    const state = get();
    const editor = state.editors.find((e) => e.id === id);
    if (editor) {
      invoke("update_editor", {
        id,
        input: {
          name: editor.name,
          path: editor.path,
          icon: editor.icon,
          is_default: false,
        }
      }).then((editors: unknown) => {
        set({ editors: editors as EditorConfig[] });
      }).catch(console.error);
    }
  },
  setDefaultEditor: (id) => {
    set((state) => {
      const editor = state.editors.find((e) => e.id === id);
      if (!editor) return state;
      const others = state.editors.filter((e) => e.id !== id);
      return { editors: [editor, ...others] };
    });
    invoke("set_default_editor", { id }).then((editors: unknown) => {
      set({ editors: editors as EditorConfig[] });
    }).catch(console.error);
  },

  // Terminal Settings
  terminalConfig: { type: "default" },
  setTerminalConfig: (terminalConfig) => {
    set({ terminalConfig });
    invoke("save_terminal_config", {
      input: {
        terminal_type: terminalConfig.type,
        custom_path: terminalConfig.customPath,
        terminal_path: terminalConfig.paths?.[terminalConfig.type],
      }
    }).catch(console.error);
  },

  // Notifications (消息通知)
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 10),
    }));
    // 同步到后端（message 必须为 string，undefined 会导致 Rust 反序列化失败）
    invoke("add_notification", {
      input: {
        notification_type: notification.type,
        title: notification.title,
        message: notification.message || "",
      }
    }).catch(console.error);
  },
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
    invoke("remove_notification", { id }).catch(console.error);
  },
  clearAllNotifications: () => {
    set({ notifications: [] });
    invoke("clear_notifications").catch(console.error);
  },

  // App Shortcuts (应用快捷键)
  appShortcuts: [],
  setAppShortcuts: (appShortcuts) => set({ appShortcuts }),

  // Auto Update (自动更新)
  autoUpdate: true,
  setAutoUpdate: (autoUpdate) => {
    set({ autoUpdate });
    saveAppSettings({ auto_update: autoUpdate });
  },

  // AI Providers (AI 供应商)
  aiProviders: [],
  setAiProviders: (aiProviders) => set({ aiProviders }),
  ensureAiDefaultProvider: (providers) => {
    const hasDefault = providers.some((p) => p.isDefaultProvider && p.enabled);
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

  // Shortcut Quick Lookup (快捷键快速查找弹窗)
  showShortcutQuickLookup: false,
  toggleShortcutQuickLookup: () => set((state) => ({ showShortcutQuickLookup: !state.showShortcutQuickLookup })),

  // Clipboard Quick Access (剪贴板快速访问弹窗)
  showClipboardQuickAccess: false,
  toggleClipboardQuickAccess: () => set((state) => ({ showClipboardQuickAccess: !state.showClipboardQuickAccess })),

  // 弹窗自动隐藏窗口
  popupAutoHideWindow: false,
  setPopupAutoHideWindow: (v) => set({ popupAutoHideWindow: v }),

  // Toolbox Navigation Target
  toolboxNavigateTarget: null,
  navigateToTool: (tool) => set({ currentPage: "toolbox", toolboxNavigateTarget: tool }),
  clearToolboxNavigateTarget: () => set({ toolboxNavigateTarget: null }),
}));
