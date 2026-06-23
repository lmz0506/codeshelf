import { KeyRound } from "lucide-react";
import { KeyAddForm } from "./KeyAddForm";
import { KeyListItem } from "./KeyListItem";
import { generateToken, isActiveKey } from "./utils";
import type { McpGatewayKey } from "./types";

interface Props {
  keys: McpGatewayKey[];
  httpUrl: string;
  onSaveKeys: (next: McpGatewayKey[]) => Promise<void> | void;
  onCopy: (text: string, label: string) => void;
}

/** 「访问密钥」整段：标题 + 计数 + 添加表单 + 密钥列表。 */
export function KeyManagerSection({ keys, httpUrl, onSaveKeys, onCopy }: Props) {
  const activeCount = keys.filter(isActiveKey).length;

  function toggleKey(id: string, enabled: boolean) {
    onSaveKeys(keys.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }

  function removeKey(id: string) {
    onSaveKeys(keys.filter((item) => item.id !== id));
  }

  function regenerateKey(id: string) {
    onSaveKeys(
      keys.map((item) =>
        item.id === id
          ? { ...item, key: generateToken(), createdAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  return (
    <section className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <KeyRound size={16} /> 访问密钥
        </div>
        <span className="text-xs text-gray-500">
          {keys.length === 0 ? "未启用鉴权" : `${activeCount}/${keys.length} 个可用`}
        </span>
      </div>

      <KeyAddForm existingKeys={keys} onAdd={(entry) => onSaveKeys([...keys, entry])} />

      <div className="space-y-2">
        {keys.length === 0 && (
          <div className="text-xs text-gray-500 border border-dashed border-amber-300 bg-amber-50/40 rounded p-3">
            暂无密钥。<strong className="text-amber-700">未配置任何密钥时，网关对所有可访问到端口的客户端开放</strong>，
            建议至少添加并启用一条密钥。
          </div>
        )}
        {keys.map((entry) => (
          <KeyListItem
            key={entry.id}
            entry={entry}
            httpUrl={httpUrl}
            onToggle={(enabled) => toggleKey(entry.id, enabled)}
            onRemove={() => removeKey(entry.id)}
            onRegenerate={() => regenerateKey(entry.id)}
            onCopy={onCopy}
          />
        ))}
      </div>
    </section>
  );
}
