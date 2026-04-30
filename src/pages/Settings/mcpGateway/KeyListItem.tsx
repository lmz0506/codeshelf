import { useMemo, useState } from "react";
import { Copy, ExternalLink, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import {
  configForKeyHeader,
  expiringSoon,
  expiryLabel,
  isActiveKey,
  keyFormatLabel,
  keyStateLabel,
  maskKey,
  parseKey,
} from "./utils";
import type { McpGatewayKey } from "./types";

interface Props {
  entry: McpGatewayKey;
  httpUrl: string;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onRegenerate: () => void;
  onCopy: (text: string, label: string) => void;
}

const FORMAT_TONE = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
} as const;

/**
 * 单条密钥的展示行：
 * - 默认遮蔽密钥，点眼睛切换显示，避免在屏幕共享/截屏时不小心暴露
 * - 重新生成、删除均带确认
 * - 即将过期的密钥有醒目角标
 * - 格式角标显示 v1（标准）/ legacy / 非标准
 * - 复制配置按钮使用「标头鉴权」格式（许多 MCP 客户端会丢失 URL 查询参数）
 */
export function KeyListItem({ entry, httpUrl, onToggle, onRemove, onRegenerate, onCopy }: Props) {
  const [revealed, setRevealed] = useState(false);
  const active = isActiveKey(entry);
  const expSoon = expiringSoon(entry, 7);
  const parsed = useMemo(() => parseKey(entry.key), [entry.key]);
  const fmt = keyFormatLabel(parsed);

  function handleRegenerate() {
    if (confirm(`确认重新生成 "${entry.name}" 的密钥吗？\n\n旧密钥会立即失效，所有使用该密钥的客户端必须更新配置。`)) {
      onRegenerate();
    }
  }
  function handleRemove() {
    if (confirm(`确认删除密钥 "${entry.name}" 吗？\n\n删除后，使用该密钥的客户端会失去访问权限，且无法恢复。`)) {
      onRemove();
    }
  }

  return (
    <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
      <input
        type="checkbox"
        checked={entry.enabled}
        onChange={(e) => onToggle(e.target.checked)}
        title={entry.enabled ? "停用此密钥" : "启用此密钥"}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <span>{entry.name}</span>
          <span className={`text-[11px] ${active ? "text-emerald-600" : "text-gray-400"}`}>
            {keyStateLabel(entry)}
          </span>
          <span className={`text-[10px] rounded px-1.5 py-0.5 border ${FORMAT_TONE[fmt.tone]}`}>
            {fmt.text}
          </span>
          {expSoon && (
            <span className="text-[11px] rounded bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5">
              即将过期
            </span>
          )}
        </div>
        <div className="text-xs font-mono text-gray-500 truncate flex items-center gap-1">
          <span className="truncate">{revealed ? entry.key : maskKey(entry.key)}</span>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 shrink-0"
            onClick={() => setRevealed((v) => !v)}
            title={revealed ? "隐藏密钥" : "显示密钥"}
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <div className="text-[11px] text-gray-400">{expiryLabel(entry)}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onCopy(entry.key, "密钥")} title="复制密钥">
        <Copy size={14} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCopy(`Bearer ${entry.key}`, "Authorization 标头值")}
        title="复制 Authorization 标头值（Bearer xxx）"
      >
        <span className="text-[10px] font-semibold">Bearer</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCopy(configForKeyHeader(httpUrl, entry.key), "客户端配置")}
        title="复制客户端 JSON 配置（标头鉴权）"
      >
        <ExternalLink size={14} />
      </Button>
      <Button variant="ghost" size="sm" onClick={handleRegenerate} title="重新生成密钥（旧密钥立即失效）">
        <RefreshCw size={14} />
      </Button>
      <Button variant="ghost" size="sm" onClick={handleRemove} title="删除密钥">
        <Trash2 size={14} />
      </Button>
    </div>
  );
}
