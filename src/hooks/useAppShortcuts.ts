import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import type { AppShortcutBinding } from "@/types";
import type { ToolType } from "@/types/toolbox";

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

// ============== 默认快捷键配置 ==============

export const DEFAULT_APP_SHORTCUTS: AppShortcutBinding[] = [
  // 页面导航
  { id: "nav_shelf", label: "打开书架", description: "切换到书架页面", keys: "ctrl+1", defaultKeys: "ctrl+1", enabled: true },
  { id: "nav_dashboard", label: "打开仪表盘", description: "切换到仪表盘页面", keys: "ctrl+2", defaultKeys: "ctrl+2", enabled: true },
  { id: "nav_toolbox", label: "打开工具箱", description: "切换到工具箱页面", keys: "ctrl+3", defaultKeys: "ctrl+3", enabled: true },
  { id: "nav_settings", label: "打开设置", description: "切换到设置页面", keys: "ctrl+4", defaultKeys: "ctrl+4", enabled: true },
  // 快速打开工具
  { id: "tool_monitor", label: "系统监控", description: "快速打开系统监控工具", keys: "ctrl+shift+1", defaultKeys: "ctrl+shift+1", enabled: true },
  { id: "tool_download", label: "文件下载", description: "快速打开文件下载工具", keys: "ctrl+shift+2", defaultKeys: "ctrl+shift+2", enabled: true },
  { id: "tool_server", label: "本地服务", description: "快速打开本地服务工具", keys: "ctrl+shift+3", defaultKeys: "ctrl+shift+3", enabled: true },
  { id: "tool_claude", label: "Claude Code", description: "快速打开 Claude Code 配置管理", keys: "ctrl+shift+4", defaultKeys: "ctrl+shift+4", enabled: true },
  { id: "tool_netcat", label: "Netcat", description: "快速打开 Netcat 协议测试", keys: "ctrl+shift+5", defaultKeys: "ctrl+shift+5", enabled: true },
  { id: "tool_shortcuts", label: "快捷键备忘", description: "快速打开快捷键备忘录", keys: "ctrl+shift+6", defaultKeys: "ctrl+shift+6", enabled: true },
  // 其他
  { id: "toggle_sidebar", label: "切换侧边栏", description: "展开/收起侧边栏", keys: "ctrl+b", defaultKeys: "ctrl+b", enabled: true },
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
 * 从 KeyboardEvent 构建规范化快捷键字符串
 */
export function eventToKeys(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const parts: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");

  const modifiers = new Set(["Control", "Alt", "Shift", "Meta"]);
  if (modifiers.has(e.key)) return null; // 只有修饰键

  parts.push(codeToKey((e as KeyboardEvent).code || ""));
  return parts.join("+");
}

/**
 * 从 KeyboardEvent 构建修饰键预览（按住修饰键还没按主键时）
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

// ============== 初始化 + 全局监听 ==============

/**
 * 确保应用快捷键已初始化（首次使用写入默认值）
 */
export async function ensureAppShortcuts(): Promise<AppShortcutBinding[]> {
  const { appShortcuts, setAppShortcuts } = useAppStore.getState();

  if (appShortcuts.length > 0) return appShortcuts;

  // 首次使用，写入默认快捷键
  const defaults = DEFAULT_APP_SHORTCUTS;
  try {
    await invoke("save_app_shortcuts", { shortcuts: defaults });
  } catch (err) {
    console.error("保存默认快捷键失败:", err);
  }
  setAppShortcuts(defaults);
  return defaults;
}

/**
 * 全局键盘快捷键监听 Hook
 */
export function useAppShortcuts() {
  useEffect(() => {
    // 确保初始化
    ensureAppShortcuts();

    function handleKeyDown(e: KeyboardEvent) {
      // 跳过输入框
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const pressed = eventToKeys(e);
      if (!pressed) return;

      const { appShortcuts } = useAppStore.getState();
      const binding = appShortcuts.find((s) => s.enabled && s.keys === pressed);
      if (!binding) return;

      e.preventDefault();
      e.stopPropagation();
      executeAction(binding.id);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
