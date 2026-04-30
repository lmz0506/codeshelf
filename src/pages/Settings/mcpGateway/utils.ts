import type { ExpiryConfig, McpGatewayKey } from "./types";

/** 生成一个 256 位、URL-safe 编码的 MCP 访问密钥。 */
export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `cs_mcp_${encoded}`;
}

/** 判定密钥是否当前可用：必须启用、非空、且未过期。 */
export function isActiveKey(entry: McpGatewayKey) {
  if (!entry.enabled || !entry.key.trim()) return false;
  if (!entry.expiresAt) return true;
  return new Date(entry.expiresAt).getTime() > Date.now();
}

export function keyStateLabel(entry: McpGatewayKey) {
  if (!entry.enabled) return "已停用";
  if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) return "已过期";
  return "可用";
}

export function expiryLabel(entry: McpGatewayKey) {
  if (!entry.expiresAt) return "永久有效";
  const ts = new Date(entry.expiresAt).getTime();
  if (Number.isNaN(ts)) return "过期时间格式无效";
  const local = new Date(entry.expiresAt).toLocaleString();
  if (ts <= Date.now()) return `已于 ${local} 过期`;
  const days = Math.ceil((ts - Date.now()) / (24 * 3600 * 1000));
  return `${local}（剩余 ${days} 天）`;
}

/** 把 input[type=datetime-local] 的值转成 ISO；不合法或不晚于现在返回 null。 */
export function localDateToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
  return date.toISOString();
}

const PRESET_DAYS: Record<string, number> = {
  preset_1d: 1,
  preset_7d: 7,
  preset_30d: 30,
  preset_90d: 90,
};

/** 根据 ExpiryConfig 解析为 ISO 字符串；ok=false 表示输入无效（仅 at 模式可能出现）。 */
export function resolveExpiry(config: ExpiryConfig): { iso: string | null; ok: boolean } {
  if (config.mode === "never") return { iso: null, ok: true };
  if (config.mode === "at") {
    const iso = localDateToIso(config.customLocal);
    return { iso, ok: iso !== null };
  }
  const days = PRESET_DAYS[config.mode];
  if (!days) return { iso: null, ok: false };
  return {
    iso: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
    ok: true,
  };
}

/** 生成给客户端复制粘贴的 mcpServers JSON 配置。 */
export function configForKey(url: string, key: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "codeshelf-api": {
          url: `${url}?key=${encodeURIComponent(key)}`,
        },
      },
    },
    null,
    2,
  );
}

/** 把密钥中间部分用 • 替换，避免 UI 上意外被人看到/截屏。 */
export function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(Math.min(20, key.length - 10))}${key.slice(-4)}`;
}

export type KeyStrength = "empty" | "weak" | "medium" | "strong";

/** 简单的密钥强度评估：基于长度和字符种类。仅作为「这个手填的看起来太弱」的提示。 */
export function evaluateKeyStrength(key: string): KeyStrength {
  if (!key) return "empty";
  const trimmed = key.trim();
  if (trimmed.length < 16) return "weak";
  let classes = 0;
  if (/[a-z]/.test(trimmed)) classes++;
  if (/[A-Z]/.test(trimmed)) classes++;
  if (/[0-9]/.test(trimmed)) classes++;
  if (/[^A-Za-z0-9]/.test(trimmed)) classes++;
  if (classes <= 2 && trimmed.length < 24) return "weak";
  if (classes >= 3 && trimmed.length >= 24) return "strong";
  return "medium";
}

export function keyStrengthLabel(strength: KeyStrength) {
  switch (strength) {
    case "weak": return { text: "弱：长度短或字符种类少", tone: "text-red-600" };
    case "medium": return { text: "一般：建议进一步增加长度或字符种类", tone: "text-amber-600" };
    case "strong": return { text: "强", tone: "text-emerald-600" };
    case "empty":
    default: return { text: "", tone: "" };
  }
}

/** 监听地址是否暴露给本机以外（粗略判断，仅作为提示用）。 */
export function isExposedHost(host: string | null | undefined) {
  if (!host) return false;
  const normalized = host.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized !== "127.0.0.1" &&
    normalized !== "localhost" &&
    normalized !== "::1"
  );
}

/** 是否在指定天数内过期（不包含已过期）。 */
export function expiringSoon(entry: McpGatewayKey, days = 7) {
  if (!entry.expiresAt) return false;
  const ts = new Date(entry.expiresAt).getTime();
  if (Number.isNaN(ts)) return false;
  const remaining = ts - Date.now();
  return remaining > 0 && remaining <= days * 24 * 3600 * 1000;
}

/** 生成一个稳定的 mcp_xxx 形式 id。 */
export function newKeyId() {
  return `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
