import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RotateCcw, Keyboard, Pencil, X, Globe, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import { useAppStore } from "@/stores/appStore";
import {
  DEFAULT_APP_SHORTCUTS,
  displayKeys,
  eventToKeys,
  eventToModifierPreview,
} from "@/hooks/useAppShortcuts";
import type { AppShortcutBinding } from "@/types";

interface ShortcutSettingsProps {
  onClose?: () => void;
}

// 快捷键分组定义
const GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "全局",
    ids: ["show_window"],
  },
  {
    label: "页面导航",
    ids: ["nav_shelf", "nav_dashboard", "nav_toolbox", "nav_settings"],
  },
  {
    label: "快速打开工具",
    ids: [
      "tool_monitor",
      "tool_download",
      "tool_server",
      "tool_claude",
      "tool_netcat",
      "tool_shortcuts",
    ],
  },
  {
    label: "其他",
    ids: ["toggle_sidebar"],
  },
];

const IS_WINDOWS = /Windows/.test(navigator.userAgent);

function getConflictWarning(keys: string): string | null {
  if (!IS_WINDOWS) return null;
  const parts = keys.toLowerCase().split("+");
  if (parts.includes("alt") && parts.includes("shift") && !parts.includes("ctrl")) {
    return "Alt+Shift 在 Windows 上是默认的输入法切换热键，可能导致快捷键失效";
  }
  return null;
}

export function ShortcutSettings({ onClose }: ShortcutSettingsProps) {
  const { appShortcuts, setAppShortcuts } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const captureRef = useRef<HTMLDivElement>(null);

  const shortcuts = appShortcuts.length > 0 ? appShortcuts : DEFAULT_APP_SHORTCUTS;

  function getShortcut(id: string): AppShortcutBinding | undefined {
    return shortcuts.find((s) => s.id === id);
  }

  async function saveAll(updated: AppShortcutBinding[]) {
    setAppShortcuts(updated);
    try {
      await invoke("save_app_shortcuts", { shortcuts: updated });
    } catch (err) {
      console.error("保存快捷键配置失败:", err);
    }
  }

  // 开始录制
  function startCapture(id: string) {
    setEditingId(id);
    setPreview("");
    setTimeout(() => captureRef.current?.focus(), 0);
  }

  // 按键捕获
  function handleCaptureKeyDown(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setEditingId(null);
      setPreview("");
      return;
    }

    const keys = eventToKeys(e);
    if (keys) {
      // 完成捕获
      const updated = shortcuts.map((s) =>
        s.id === editingId ? { ...s, keys } : s
      );
      saveAll(updated);
      setEditingId(null);
      setPreview("");
    } else {
      // 仅修饰键，显示预览
      setPreview(eventToModifierPreview(e));
    }
  }

  function handleCaptureKeyUp(e: React.KeyboardEvent) {
    e.preventDefault();
    if (!editingId) return;
    // 更新修饰键预览
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");
    setPreview(parts.length > 0 ? displayKeys(parts.join("+")) + " + ..." : "");
  }

  // 切换启用/禁用
  function toggleEnabled(id: string) {
    const updated = shortcuts.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    saveAll(updated);
  }

  // 切换全局/应用内
  function toggleGlobal(id: string) {
    const updated = shortcuts.map((s) =>
      s.id === id ? { ...s, global: !s.global } : s
    );
    saveAll(updated);
  }

  // 恢复默认
  function resetAll() {
    saveAll(DEFAULT_APP_SHORTCUTS);
  }

  // 渲染按键标签
  function renderKeys(keys: string) {
    const display = displayKeys(keys);
    const parts = display
      .split("+")
      .map((k) => k.trim())
      .filter(Boolean);
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {parts.map((part, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-gray-400 text-xs">+</span>}
            <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm text-gray-700 dark:text-gray-300 min-w-[1.5rem] text-center">
              {part}
            </kbd>
          </span>
        ))}
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          快捷键设置
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw size={14} className="mr-1" />
            恢复默认
          </Button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-sm text-blue-500 hover:text-blue-700"
            >
              收起
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {GROUPS.map((group) => {
          const groupShortcuts = group.ids
            .map(getShortcut)
            .filter(Boolean) as AppShortcutBinding[];
          if (groupShortcuts.length === 0) return null;

          return (
            <div key={group.label}>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                {group.label}
              </h4>
              <div className="re-card overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                {groupShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-center gap-3 px-4 py-2.5 group"
                  >
                    {/* 标签 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {shortcut.label}
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {shortcut.description}
                      </div>
                      {getConflictWarning(shortcut.keys) && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-amber-500 dark:text-amber-400">
                          <AlertTriangle size={11} className="flex-shrink-0" />
                          <span>{getConflictWarning(shortcut.keys)}</span>
                        </div>
                      )}
                    </div>

                    {/* 快捷键显示 / 录制区域 */}
                    <div className="flex-shrink-0">
                      {editingId === shortcut.id ? (
                        <div
                          ref={captureRef}
                          tabIndex={0}
                          onKeyDown={handleCaptureKeyDown}
                          onKeyUp={handleCaptureKeyUp}
                          onBlur={() => {
                            setEditingId(null);
                            setPreview("");
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm border-2 border-blue-400 dark:border-blue-500 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 animate-pulse focus:outline-none min-w-[160px]"
                        >
                          <Keyboard
                            size={14}
                            className="text-blue-500 flex-shrink-0"
                          />
                          <span className="text-blue-600 dark:text-blue-400 text-xs">
                            {preview || "按下快捷键组合..."}
                          </span>
                        </div>
                      ) : (
                        renderKeys(shortcut.keys)
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {editingId === shortcut.id ? (
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEditingId(null);
                            setPreview("");
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                          title="取消"
                        >
                          <X size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => startCapture(shortcut.id)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="修改快捷键"
                        >
                          <Pencil size={13} />
                        </button>
                      )}

                      {/* 全局快捷键切换 */}
                      <button
                        onClick={() => toggleGlobal(shortcut.id)}
                        className={`p-1 rounded transition-colors ${
                          shortcut.global
                            ? "text-green-500 hover:text-green-600 bg-green-50 dark:bg-green-900/20"
                            : "text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100"
                        }`}
                        title={shortcut.global ? "全局快捷键（最小化/托盘时也生效）" : "仅窗口内生效，点击设为全局"}
                      >
                        <Globe size={13} />
                      </button>

                      {/* 启用/禁用开关 */}
                      <button
                        onClick={() => toggleEnabled(shortcut.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-1 ${
                          shortcut.enabled
                            ? "bg-blue-500"
                            : "bg-gray-300 dark:bg-gray-600"
                        }`}
                        title={shortcut.enabled ? "已启用" : "已禁用"}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            shortcut.enabled
                              ? "translate-x-[18px]"
                              : "translate-x-[3px]"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        {/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
          ? "Ctrl 对应 Command 键。"
          : ""}
        点击 <Globe size={11} className="inline -mt-0.5 text-green-500" /> 可将快捷键设为全局，最小化或托盘状态下也能触发。在输入框中不会触发快捷键。
      </p>
    </div>
  );
}
