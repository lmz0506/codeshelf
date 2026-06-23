// 几个 store 共用的后端持久化函数（debounced）。
// 抽出到独立模块，避免每个 store 重复定义 debounce 包装。

import { invoke } from "@tauri-apps/api/core";

const debounce = <T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

export const saveAppSettings = debounce(
  async (settings: {
    theme?: string;
    view_mode?: string;
    sidebar_collapsed?: boolean;
    scan_depth?: number;
    auto_update?: boolean;
    chat_history_dir?: string;
    chat_bridge_enabled?: boolean;
    openclaw_relay_endpoint?: string;
    bridge_provider_id?: string;
    bridge_model_id?: string;
    bridge_client_id?: string;
    show_dock_icon?: boolean;
  }) => {
    try {
      await invoke("save_app_settings", { input: settings });
    } catch (err) {
      console.error("保存应用设置失败:", err);
    }
  },
  300
);

export const saveUiState = debounce(
  async (state: { recent_detail_project_ids?: string[] }) => {
    try {
      await invoke("save_ui_state", { input: state });
    } catch (err) {
      console.error("保存UI状态失败:", err);
    }
  },
  300
);
