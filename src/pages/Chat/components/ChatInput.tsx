import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Square, CornerDownLeft } from "lucide-react";
import { filterSlashCommands, matchSlashCommand, type SlashCommand, type SlashCommandId } from "../utils/slashCommands";
import { SlashCommandMenu } from "./SlashCommandMenu";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onSlashCommand: (id: SlashCommandId) => void;
  streaming: boolean;
  disabled: boolean;
  /** 用户历史消息（content），由父组件根据会话计算，最新在前 */
  userHistory: string[];
  /** 粘贴的图片 dataUrl 列表（来自 clipboard 图片） */
  onImagePaste?: (dataUrl: string) => void;
  /** 渲染在输入框上方的附件 strip */
  attachmentsSlot?: React.ReactNode;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  onSlashCommand,
  streaming,
  disabled,
  userHistory,
  onImagePaste,
  attachmentsSlot,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [highlighted, setHighlighted] = useState(0);

  const showSlashMenu = useMemo(() => {
    return value.startsWith("/") && !value.includes("\n") && !streaming;
  }, [value, streaming]);

  const filteredCommands = useMemo(() => (showSlashMenu ? filterSlashCommands(value) : []), [showSlashMenu, value]);

  useEffect(() => {
    setHighlighted(0);
  }, [value, showSlashMenu]);

  // 自动增高
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22;
    const maxHeight = lineHeight * 12 + 24;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
  }, [value]);

  function applySlash(cmd: SlashCommand) {
    onChange("");
    onSlashCommand(cmd.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        applySlash(filteredCommands[highlighted]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onChange("");
        return;
      }
    }

    if (streaming && e.key === "Escape") {
      e.preventDefault();
      onStop();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendClick();
      return;
    }

    // 历史回溯：只在 textarea 为空时
    if (e.key === "ArrowUp" && !e.shiftKey && value === "" && userHistory.length > 0) {
      e.preventDefault();
      const nextIdx = Math.min(historyIndex + 1, userHistory.length - 1);
      setHistoryIndex(nextIdx);
      onChange(userHistory[nextIdx]);
      return;
    }
    if (e.key === "ArrowDown" && historyIndex >= 0) {
      const nextIdx = historyIndex - 1;
      if (nextIdx < 0) {
        setHistoryIndex(-1);
        onChange("");
      } else {
        setHistoryIndex(nextIdx);
        onChange(userHistory[nextIdx]);
      }
      return;
    }
  }

  function handleSendClick() {
    const slash = matchSlashCommand(value);
    if (slash) {
      applySlash(slash);
      return;
    }
    if (!value.trim() || disabled || streaming) return;
    setHistoryIndex(-1);
    onSend();
  }

  const charCount = value.length;
  const estTokens = Math.ceil(charCount / 4);

  return (
    <div className="border-t border-gray-200 pt-3 relative">
      {attachmentsSlot}
      <textarea
        ref={textareaRef}
        className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none leading-[22px]"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          if (!onImagePaste) return;
          const items = e.clipboardData?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === "file" && item.type.startsWith("image/")) {
              const blob = item.getAsFile();
              if (!blob) continue;
              e.preventDefault();
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") onImagePaste(reader.result);
              };
              reader.readAsDataURL(blob);
            }
          }
        }}
        placeholder="输入消息，Enter 发送 / Shift+Enter 换行 / 输入 / 查看命令 / 粘贴图片自动附加"
        disabled={disabled}
      />
      {showSlashMenu && (
        <SlashCommandMenu
          commands={filteredCommands}
          highlightedIndex={highlighted}
          onSelect={applySlash}
          onHover={setHighlighted}
        />
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="text-[11px] text-gray-400 flex items-center gap-2">
          <CornerDownLeft size={11} />
          <span>{charCount} 字符 ≈ {estTokens} tokens</span>
        </div>
        <div className="flex items-center gap-2">
          {streaming ? (
            <button
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg flex items-center gap-1"
              onClick={onStop}
            >
              <Square size={12} /> 停止 (Esc)
            </button>
          ) : (
            <button
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1 disabled:opacity-60"
              onClick={handleSendClick}
              disabled={disabled || !value.trim()}
            >
              <Send size={12} /> 发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
