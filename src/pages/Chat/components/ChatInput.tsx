import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Square, CornerDownLeft } from "lucide-react";
import { filterSlashCommands, matchSlashCommand, type SlashCommand, type SlashCommandId } from "../utils/slashCommands";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { listDirEntries, type MentionFileEntry } from "@/services/chat";

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
  /** 拖入文件/目录后回调（已读取文本或 dataUrl） */
  onFilesDropped?: (files: DroppedFile[]) => void;
  /** 用于 @ 文件补全的根目录；未设则禁用 @ 补全 */
  mentionRoot?: string | null;
  /** 渲染在输入框上方的附件 strip */
  attachmentsSlot?: React.ReactNode;
}

export interface DroppedFile {
  name: string;
  kind: "image" | "text";
  dataUrl?: string;
  content?: string;
}

const TEXT_FILE_RE = /\.(txt|md|markdown|json|ya?ml|toml|xml|html?|css|scss|less|js|jsx|ts|tsx|mjs|cjs|py|rs|go|java|kt|swift|c|h|cc|cpp|hpp|cs|rb|php|sh|bash|zsh|fish|ps1|sql|conf|ini|env|gitignore|editorconfig|vue|svelte|astro|lua|dart|ex|exs|erl|hs|ml|mli|scala|clj|cljs|r|jl|pl|pm|tex)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_FILES = 20;
const MAX_DEPTH = 2;

async function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}

async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function convertFile(file: File, relName: string): Promise<DroppedFile | null> {
  if (IMAGE_RE.test(file.name) || file.type.startsWith("image/")) {
    const dataUrl = await readBlobAsDataUrl(file);
    return { name: relName, kind: "image", dataUrl };
  }
  if (!TEXT_FILE_RE.test(file.name) && !file.type.startsWith("text/")) return null;
  if (file.size > MAX_FILE_BYTES) {
    const blob = file.slice(0, MAX_FILE_BYTES);
    const content = (await readBlobAsText(blob)) + "\n…（已截断）";
    return { name: relName, kind: "text", content };
  }
  const content = await readBlobAsText(file);
  return { name: relName, kind: "text", content };
}

async function walkEntry(
  entry: any,
  prefix: string,
  out: DroppedFile[],
  depth: number,
): Promise<void> {
  if (out.length >= MAX_FILES) return;
  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
    const converted = await convertFile(file, prefix + file.name);
    if (converted) out.push(converted);
    return;
  }
  if (entry.isDirectory && depth < MAX_DEPTH) {
    const reader = entry.createReader();
    const entries: any[] = await new Promise((resolve) => reader.readEntries(resolve));
    for (const e of entries) {
      if (out.length >= MAX_FILES) break;
      const name = e.name as string;
      if (name.startsWith(".") || ["node_modules", "target", "dist", "build"].includes(name)) continue;
      await walkEntry(e, `${prefix}${entry.name}/`, out, depth + 1);
    }
  }
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
  onFilesDropped,
  mentionRoot,
  attachmentsSlot,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [highlighted, setHighlighted] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [mentionEntries, setMentionEntries] = useState<MentionFileEntry[]>([]);
  const [mentionLoaded, setMentionLoaded] = useState<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const showSlashMenu = useMemo(() => {
    return value.startsWith("/") && !value.includes("\n") && !streaming;
  }, [value, streaming]);

  const filteredCommands = useMemo(() => (showSlashMenu ? filterSlashCommands(value) : []), [showSlashMenu, value]);

  // @ 文件补全：在光标位置往前找最近的 @ 触发（同一行、无空格截断）
  const mentionQuery = useMemo(() => {
    if (!mentionRoot) return null;
    const el = textareaRef.current;
    const caret = el ? el.selectionStart ?? value.length : value.length;
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|[\s(])@([A-Za-z0-9_\-./]*)$/);
    return m ? m[1] : null;
  }, [value, mentionRoot]);

  const showMentionMenu = mentionQuery !== null && !streaming;

  useEffect(() => {
    if (!mentionRoot || mentionLoaded === mentionRoot) return;
    let cancelled = false;
    listDirEntries(mentionRoot, 800)
      .then((list) => { if (!cancelled) { setMentionEntries(list.filter((e) => !e.isDir)); setMentionLoaded(mentionRoot); } })
      .catch(() => { if (!cancelled) setMentionEntries([]); });
    return () => { cancelled = true; };
  }, [mentionRoot, mentionLoaded]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const pool = mentionEntries;
    const scored = q
      ? pool.filter((e) => e.path.toLowerCase().includes(q))
      : pool;
    return scored.slice(0, 8);
  }, [mentionEntries, mentionQuery]);

  useEffect(() => { setMentionHighlight(0); }, [mentionQuery]);

  function applyMention(path: string) {
    const el = textareaRef.current;
    const caret = el ? el.selectionStart ?? value.length : value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(/@([A-Za-z0-9_\-./]*)$/, `@${path} `);
    const next = replaced + after;
    onChange(next);
    requestAnimationFrame(() => {
      const el2 = textareaRef.current;
      if (el2) {
        const pos = replaced.length;
        el2.focus();
        el2.setSelectionRange(pos, pos);
      }
    });
  }

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
    if (showMentionMenu && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        applyMention(mentionCandidates[mentionHighlight].path);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // 用空格断掉 @pattern 以关闭菜单
        const el = textareaRef.current;
        const caret = el ? el.selectionStart ?? value.length : value.length;
        onChange(value.slice(0, caret) + " " + value.slice(caret));
        return;
      }
    }

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
    <div
      className={`border-t border-gray-200 pt-3 relative ${dragOver ? "ring-2 ring-blue-400 ring-offset-2 rounded-lg" : ""}`}
      onDragOver={(e) => {
        if (!onFilesDropped) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        if (!onFilesDropped) return;
        e.preventDefault();
        setDragOver(false);
        const items = e.dataTransfer.items;
        const out: DroppedFile[] = [];
        if (items && items.length > 0) {
          for (let i = 0; i < items.length; i++) {
            const entry = (items[i] as any).webkitGetAsEntry?.();
            if (entry) {
              await walkEntry(entry, "", out, 0);
            } else {
              const f = items[i].getAsFile?.();
              if (f) {
                const c = await convertFile(f, f.name);
                if (c) out.push(c);
              }
            }
            if (out.length >= MAX_FILES) break;
          }
        } else {
          for (const f of Array.from(e.dataTransfer.files)) {
            const c = await convertFile(f, f.name);
            if (c) out.push(c);
            if (out.length >= MAX_FILES) break;
          }
        }
        if (out.length) onFilesDropped(out);
      }}
    >
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
        placeholder="输入消息，Enter 发送, Shift+Enter 换行, 输入/查看命令, 输入@选择文件, 粘贴图片自动附加"
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
      {showMentionMenu && mentionCandidates.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-[220px] overflow-auto">
          <div className="px-2 py-1 text-[10px] text-gray-400 border-b border-gray-100">
            @ 引用文件 · ↑↓ 选择 · Enter/Tab 确认 · Esc 关闭
          </div>
          {mentionCandidates.map((e, i) => (
            <div
              key={e.path}
              className={`px-3 py-1 text-xs font-mono cursor-pointer flex items-center gap-2 ${i === mentionHighlight ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}
              onMouseEnter={() => setMentionHighlight(i)}
              onMouseDown={(ev) => { ev.preventDefault(); applyMention(e.path); }}
            >
              <span>📄</span>
              <span className="truncate">{e.path}</span>
            </div>
          ))}
        </div>
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
