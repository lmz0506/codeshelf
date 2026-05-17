import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface EditorConfig {
  id: string;
  name: string;
  path: string;
  icon?: string;
  is_default?: boolean;
}

export interface TerminalConfig {
  type:
    | "default"
    | "powershell"
    | "cmd"
    | "terminal"
    | "iterm"
    | "custom";
  customPath?: string;
  paths?: {
    powershell?: string;
    cmd?: string;
    terminal?: string;
    iterm?: string;
    default?: string;
    custom?: string;
  };
}

interface EditorsState {
  editors: EditorConfig[];
  setEditors: (editors: EditorConfig[]) => void;
  addEditor: (editor: EditorConfig) => void;
  removeEditor: (id: string) => void;
  updateEditor: (id: string, updates: Partial<EditorConfig>) => void;
  setDefaultEditor: (id: string) => void;

  terminalConfig: TerminalConfig;
  setTerminalConfig: (config: TerminalConfig) => void;
}

export const useEditorsStore = create<EditorsState>()((set, get) => ({
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
      },
    })
      .then((editors: unknown) => {
        set({ editors: editors as EditorConfig[] });
      })
      .catch(console.error);
  },
  removeEditor: (id) => {
    set((state) => ({
      editors: state.editors.filter((e) => e.id !== id),
    }));
    invoke("remove_editor", { id })
      .then((editors: unknown) => {
        set({ editors: editors as EditorConfig[] });
      })
      .catch(console.error);
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
        },
      })
        .then((editors: unknown) => {
          set({ editors: editors as EditorConfig[] });
        })
        .catch(console.error);
    }
  },
  setDefaultEditor: (id) => {
    set((state) => {
      const editor = state.editors.find((e) => e.id === id);
      if (!editor) return state;
      const others = state.editors.filter((e) => e.id !== id);
      return { editors: [editor, ...others] };
    });
    invoke("set_default_editor", { id })
      .then((editors: unknown) => {
        set({ editors: editors as EditorConfig[] });
      })
      .catch(console.error);
  },

  terminalConfig: { type: "default" },
  setTerminalConfig: (terminalConfig) => {
    set({ terminalConfig });
    invoke("save_terminal_config", {
      input: {
        terminal_type: terminalConfig.type,
        custom_path: terminalConfig.customPath,
        terminal_path: terminalConfig.paths?.[terminalConfig.type],
      },
    }).catch(console.error);
  },
}));
