// 快捷键备忘工具的「按键录入」组件与渲染工具。
// 复用方：主面板的编辑行、添加快捷键弹窗、删除确认弹窗的按键展示。

import { useCallback, useRef, useState } from "react";
import { Keyboard } from "lucide-react";

export type Platform = "mac" | "windows";

const KEY_NAME_MAP: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Backspace: "Backspace",
  Enter: "Enter",
  Tab: "Tab",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  CapsLock: "CapsLock",
  PrintScreen: "Print Screen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  ContextMenu: "Menu",
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

function formatKeyName(key: string): string {
  if (KEY_NAME_MAP[key]) return KEY_NAME_MAP[key];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function getModifierLabel(mod: string, platform: Platform): string {
  const labels: Record<string, Record<Platform, string>> = {
    ctrl: { mac: "Control", windows: "Ctrl" },
    alt: { mac: "Option", windows: "Alt" },
    shift: { mac: "Shift", windows: "Shift" },
    meta: { mac: "Command", windows: "Win" },
  };
  return labels[mod]?.[platform] || mod;
}

/** 把 "Ctrl + Shift + T" 这种字符串渲染成 kbd 标签序列。 */
export function renderKeys(keys: string) {
  const parts = keys
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

interface KeyRecorderInputProps {
  value: string;
  onChange: (keys: string) => void;
  platform: Platform;
  placeholder?: string;
  className?: string;
}

export function KeyRecorderInput({
  value,
  onChange,
  platform,
  placeholder,
  className,
}: KeyRecorderInputProps) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        setPreview("");
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push(getModifierLabel("ctrl", platform));
      if (e.altKey) parts.push(getModifierLabel("alt", platform));
      if (e.shiftKey) parts.push(getModifierLabel("shift", platform));
      if (e.metaKey) parts.push(getModifierLabel("meta", platform));

      if (!MODIFIER_KEYS.has(e.key)) {
        parts.push(formatKeyName(e.key));
        onChange(parts.join(" + "));
        setRecording(false);
        setPreview("");
      } else {
        setPreview(parts.join(" + ") + " + ...");
      }
    },
    [recording, platform, onChange]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push(getModifierLabel("ctrl", platform));
      if (e.altKey) parts.push(getModifierLabel("alt", platform));
      if (e.shiftKey) parts.push(getModifierLabel("shift", platform));
      if (e.metaKey) parts.push(getModifierLabel("meta", platform));
      setPreview(parts.length > 0 ? parts.join(" + ") + " + ..." : "");
    },
    [recording, platform]
  );

  function toggleRecording() {
    const next = !recording;
    setRecording(next);
    setPreview("");
    if (next) inputRef.current?.focus();
  }

  return (
    <div className={`relative ${className || ""}`}>
      <input
        ref={inputRef}
        type="text"
        value={recording ? preview : value}
        onChange={(e) => {
          if (!recording) onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => {
          if (recording) {
            setRecording(false);
            setPreview("");
          }
        }}
        readOnly={recording}
        placeholder={recording ? "按下快捷键组合..." : placeholder}
        className={`w-full pr-8 px-2 py-1 text-sm bg-white dark:bg-gray-800 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          recording
            ? "border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10 placeholder-red-400 dark:placeholder-red-500"
            : "border-gray-300 dark:border-gray-600"
        }`}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          toggleRecording();
        }}
        className={`absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${
          recording
            ? "text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
            : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        }`}
        title={recording ? "停止录制 (Esc)" : "按键录入"}
      >
        <Keyboard size={14} className={recording ? "animate-pulse" : ""} />
      </button>
    </div>
  );
}
