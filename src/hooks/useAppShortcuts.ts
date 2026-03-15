import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  register,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { useAppStore } from "@/stores/appStore";
import type { AppShortcutBinding } from "@/types";
import type { ToolType } from "@/types/toolbox";

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

// ============== 默认快捷键配置 ==============

export const DEFAULT_APP_SHORTCUTS: AppShortcutBinding[] = [
  // 全局
  { id: "show_window", label: "显示/隐藏窗口", description: "切换应用窗口显示状态", keys: "alt+shift+c", defaultKeys: "alt+shift+c", enabled: true, global: true },
  // 页面导航
  { id: "nav_shelf", label: "打开书架", description: "切换到书架页面", keys: "ctrl+1", defaultKeys: "ctrl+1", enabled: true, global: false },
  { id: "nav_dashboard", label: "打开仪表盘", description: "切换到仪表盘页面", keys: "ctrl+2", defaultKeys: "ctrl+2", enabled: true, global: false },
  { id: "nav_toolbox", label: "打开工具箱", description: "切换到工具箱页面", keys: "ctrl+3", defaultKeys: "ctrl+3", enabled: true, global: false },
  { id: "nav_settings", label: "打开设置", description: "切换到设置页面", keys: "ctrl+4", defaultKeys: "ctrl+4", enabled: true, global: false },
  // 快速打开工具
  { id: "tool_monitor", label: "系统监控", description: "快速打开系统监控工具", keys: "ctrl+shift+1", defaultKeys: "ctrl+shift+1", enabled: true, global: false },
  { id: "tool_download", label: "文件下载", description: "快速打开文件下载工具", keys: "ctrl+shift+2", defaultKeys: "ctrl+shift+2", enabled: true, global: false },
  { id: "tool_server", label: "本地服务", description: "快速打开本地服务工具", keys: "ctrl+shift+3", defaultKeys: "ctrl+shift+3", enabled: true, global: false },
  { id: "tool_claude", label: "Claude Code", description: "快速打开 Claude Code 配置管理", keys: "ctrl+shift+4", defaultKeys: "ctrl+shift+4", enabled: true, global: false },
  { id: "tool_netcat", label: "Netcat", description: "快速打开 Netcat 协议测试", keys: "ctrl+shift+5", defaultKeys: "ctrl+shift+5", enabled: true, global: false },
  { id: "tool_shortcuts", label: "快捷键备忘", description: "快速打开快捷键备忘录", keys: "ctrl+shift+6", defaultKeys: "ctrl+shift+6", enabled: true, global: false },
  // 其他
  { id: "toggle_sidebar", label: "切换侧边栏", description: "展开/收起侧边栏", keys: "ctrl+b", defaultKeys: "ctrl+b", enabled: true, global: false },
];

// ============== 按键匹配工具 ==============

function codeToKey(code: string): string {
  if (code.startsWith("Digit")) return code[5];
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Numpad")) return "numpad" + code.slice(6).toLowerCase();
  const map: Record<string, string> = {
    Backslash: "\\", BracketLeft: "[", BracketRight: "]",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".",
    Slash: "/", Minus: "-", Equal: "=", Backquote: "`",
    Space: "space", Enter: "enter", Escape: "escape",
    Tab: "tab", Backspace: "backspace", Delete: "delete",
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
    Insert: "insert", CapsLock: "capslock",
  };
  if (map[code]) return map[code];
  if (/^F\d+$/.test(code)) return code.toLowerCase();
  return code.toLowerCase();
}

/**
 * 将规范化格式的快捷键转换为显示文本
 * "ctrl+shift+1" -> Mac: "Command + Shift + 1" / Win: "Ctrl + Shift + 1"
 */
export function displayKeys(keys: string): string {
  return keys
    .split("+")
    .map((part) => {
      switch (part) {
        case "ctrl": return IS_MAC ? "Command" : "Ctrl";
        case "alt": return IS_MAC ? "Option" : "Alt";
        case "shift": return "Shift";
        default:
          if (part.length === 1) return part.toUpperCase();
          if (/^f\d+$/.test(part)) return part.toUpperCase();
          return part.charAt(0).toUpperCase() + part.slice(1);
      }
    })
    .join(" + ");
}

/**
 * 将规范化格式转换为 Tauri Accelerator 格式
 * "ctrl+shift+1" -> "CmdOrCtrl+Shift+1"
 */
function toAccelerator(keys: string): string {
  return keys
    .split("+")
    .map((part) => {
      switch (part) {
        case "ctrl": return "CmdOrCtrl";
        case "alt": return "Alt";
        case "shift": return "Shift";
        default:
          if (part.length === 1) return part.toUpperCase();
          if (/^f\d+$/.test(part)) return part.toUpperCase();
          // 特殊键名首字母大写
          return part.charAt(0).toUpperCase() + part.slice(1);
      }
    })
    .join("+");
}

/**
 * 从 KeyboardEvent 构建规范化快捷键字符串
 */
export function eventToKeys(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const parts: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");

  const modifiers = new Set(["Control", "Alt", "Shift", "Meta"]);
  if (modifiers.has(e.key)) return null;

  parts.push(codeToKey((e as KeyboardEvent).code || ""));
  return parts.join("+");
}

/**
 * 从 KeyboardEvent 构建修饰键预览
 */
export function eventToModifierPreview(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  return parts.length > 0 ? displayKeys(parts.join("+")) + " + ..." : "";
}

// ============== 动作执行 ==============

const TOOL_MAP: Record<string, ToolType> = {
  tool_monitor: "monitor",
  tool_download: "downloader",
  tool_server: "server",
  tool_claude: "claude",
  tool_netcat: "netcat",
  tool_shortcuts: "shortcuts",
};

function executeAction(actionId: string) {
  const store = useAppStore.getState();

  if (actionId.startsWith("nav_")) {
    const page = actionId.replace("nav_", "") as "shelf" | "dashboard" | "toolbox" | "settings";
    store.setCurrentPage(page);
  } else if (actionId.startsWith("tool_") && TOOL_MAP[actionId]) {
    store.navigateToTool(TOOL_MAP[actionId]);
  } else if (actionId === "toggle_sidebar") {
    store.setSidebarCollapsed(!store.sidebarCollapsed);
  }
}

/**
 * 全局快捷键触发：先唤起窗口，再执行动作
 */
async function handleGlobalAction(actionId: string) {
  const win = getCurrentWindow();

  if (actionId === "show_window") {
    // 切换窗口可见性
    try {
      const visible = await win.isVisible();
      const focused = await win.isFocused();
      if (visible && focused) {
        await win.hide();
      } else {
        await win.show();
        await win.unminimize();
        await win.setFocus();
      }
    } catch (err) {
      console.error("切换窗口失败:", err);
    }
    return;
  }

  // 其他动作：先确保窗口可见
  try {
    await win.show();
    await win.unminimize();
    await win.setFocus();
  } catch (err) {
    console.error("唤起窗口失败:", err);
  }

  executeAction(actionId);
}

// ============== 全局快捷键注册/注销 ==============

let registeredAccelerators: string[] = [];

async function registerGlobalShortcuts(shortcuts: AppShortcutBinding[]) {
  // 先注销旧的
  await unregisterGlobalShortcuts();

  const globalBindings = shortcuts.filter((s) => s.enabled && s.global);
  if (globalBindings.length === 0) return;

  for (const binding of globalBindings) {
    const acc = toAccelerator(binding.keys);
    try {
      await register(acc, (event) => {
        if (event.state === "Pressed") {
          handleGlobalAction(binding.id);
        }
      });
      registeredAccelerators.push(acc);
    } catch (err) {
      console.error(`注册全局快捷键失败 [${acc}]:`, err);
    }
  }
}

async function unregisterGlobalShortcuts() {
  for (const acc of registeredAccelerators) {
    try {
      await unregister(acc);
    } catch {
      // 忽略注销失败
    }
  }
  registeredAccelerators = [];
}

// ============== 初始化 ==============

/**
 * 确保应用快捷键已初始化（首次或旧版升级时补齐新条目）
 */
export async function ensureAppShortcuts(): Promise<AppShortcutBinding[]> {
  const { appShortcuts, setAppShortcuts } = useAppStore.getState();

  if (appShortcuts.length === 0) {
    // 首次使用
    const defaults = DEFAULT_APP_SHORTCUTS;
    try {
      await invoke("save_app_shortcuts", { shortcuts: defaults });
    } catch (err) {
      console.error("保存默认快捷键失败:", err);
    }
    setAppShortcuts(defaults);
    return defaults;
  }

  // 检查是否有新增的默认条目（版本升级时）
  const existingIds = new Set(appShortcuts.map((s) => s.id));
  const newEntries = DEFAULT_APP_SHORTCUTS.filter((d) => !existingIds.has(d.id));

  if (newEntries.length > 0) {
    // 补齐 global 字段（旧数据可能没有）
    const patched = appShortcuts.map((s) => ({
      ...s,
      global: s.global ?? false,
    }));
    const merged = [...patched, ...newEntries];
    try {
      await invoke("save_app_shortcuts", { shortcuts: merged });
    } catch (err) {
      console.error("补齐快捷键失败:", err);
    }
    setAppShortcuts(merged);
    return merged;
  }

  return appShortcuts;
}

// ============== Hook ==============

/**
 * 全局键盘快捷键监听 Hook
 * - 应用内快捷键：document keydown（仅处理 non-global）
 * - 系统级快捷键：tauri-plugin-global-shortcut（仅处理 global）
 */
export function useAppShortcuts() {
  const appShortcuts = useAppStore((state) => state.appShortcuts);

  // 应用内快捷键（DOM keydown）
  useEffect(() => {
    ensureAppShortcuts();

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const pressed = eventToKeys(e);
      if (!pressed) return;

      const { appShortcuts } = useAppStore.getState();
      // 只匹配非全局快捷键（全局的由 OS 层处理，避免重复触发）
      const binding = appShortcuts.find(
        (s) => s.enabled && !s.global && s.keys === pressed
      );
      if (!binding) return;

      e.preventDefault();
      e.stopPropagation();
      executeAction(binding.id);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // 系统级全局快捷键（OS 注册）
  useEffect(() => {
    registerGlobalShortcuts(appShortcuts);

    return () => {
      unregisterGlobalShortcuts();
    };
  }, [appShortcuts]);
}
