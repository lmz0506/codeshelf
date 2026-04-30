import type { ExpiryConfig, McpGatewayKey } from "./types";

/* =============================================================================
 * 密钥格式 (CodeShelf MCP Key Format)
 * ----------------------------------------------------------------------------
 * 当前版本：v1
 *   cs_mcp_v1_<43 chars base64url 随机>_<4 chars 校验码>
 *   ├── cs_mcp ─ 产品/模块前缀，便于在日志/git 扫描中识别
 *   ├── v1     ─ 格式版本号，未来升级时可保持向后兼容
 *   ├── 32 字节随机    ─ crypto.getRandomValues 生成，base64url 编码
 *   └── 4 字符校验码   ─ FNV-1a(payload) 取 20bit 映射到 base32（去掉易混字符）
 *                        让前端能在用户粘贴时立刻发现错字、缺字
 *
 * 历史/兼容版本：legacy
 *   cs_mcp_<43 chars base64url 随机>
 *   未带版本号、无校验码。新键不会再产生这种格式，但服务端仍按字符串完整匹配，
 *   不影响已存量。
 * =============================================================================
 */

export const KEY_PREFIX = "cs_mcp";
export const KEY_VERSION = "v1";
const RANDOM_BYTE_LEN = 32;
const CHECKSUM_LEN = 4;

/** 4-char base32，去掉了 0/1/l/o 等容易看错的字符。 */
const CHECKSUM_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** 32-bit FNV-1a：纯同步实现，足够用作 4 字符校验码。 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function checksumOf(payload: string): string {
  const h = fnv1a(payload);
  return (
    CHECKSUM_ALPHABET[(h >>> 15) & 0x1f] +
    CHECKSUM_ALPHABET[(h >>> 10) & 0x1f] +
    CHECKSUM_ALPHABET[(h >>> 5) & 0x1f] +
    CHECKSUM_ALPHABET[h & 0x1f]
  );
}

/** 生成符合当前版本（v1）格式的 MCP 访问密钥。 */
export function generateToken() {
  const bytes = new Uint8Array(RANDOM_BYTE_LEN);
  crypto.getRandomValues(bytes);
  const random = base64UrlEncode(bytes);
  const checksum = checksumOf(random);
  return `${KEY_PREFIX}_${KEY_VERSION}_${random}_${checksum}`;
}

export type KeyFormat = "canonical-v1" | "legacy" | "unknown";

export interface ParsedKey {
  format: KeyFormat;
  /** v1 时为 "v1"；legacy / unknown 时为 null。 */
  version: string | null;
  /** v1 时为 base64url 随机部分；legacy 时为前缀之后的全部；unknown 时为 null。 */
  payload: string | null;
  /** v1 时为校验码；其它情况为 null。 */
  checksum: string | null;
  /** v1 时校验是否通过；其它情况为 null（即"无法验证"）。 */
  checksumOk: boolean | null;
}

/**
 * 解析任意字符串是否符合 MCP 密钥格式。
 * 服务端只做完整字符串相等比较，所以这里仅用于前端 UX
 * （强度评估、格式标签、粘贴时的快速判错）。
 */
export function parseKey(raw: string): ParsedKey {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(`${KEY_PREFIX}_`)) {
    return { format: "unknown", version: null, payload: null, checksum: null, checksumOk: null };
  }
  // 去掉 prefix 后剩余部分
  const rest = trimmed.slice(KEY_PREFIX.length + 1);

  // v1: <version>_<payload>_<checksum>
  if (rest.startsWith(`${KEY_VERSION}_`)) {
    const body = rest.slice(KEY_VERSION.length + 1);
    const lastSep = body.lastIndexOf("_");
    if (lastSep > 0 && body.length - lastSep - 1 === CHECKSUM_LEN) {
      const payload = body.slice(0, lastSep);
      const checksum = body.slice(lastSep + 1);
      return {
        format: "canonical-v1",
        version: KEY_VERSION,
        payload,
        checksum,
        checksumOk: checksumOf(payload) === checksum,
      };
    }
  }

  // legacy: 没有版本号、没有校验，直接是 base64url 随机串
  if (/^[A-Za-z0-9_-]{16,}$/.test(rest)) {
    return {
      format: "legacy",
      version: null,
      payload: rest,
      checksum: null,
      checksumOk: null,
    };
  }

  return { format: "unknown", version: null, payload: null, checksum: null, checksumOk: null };
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

export function keyFormatLabel(parsed: ParsedKey): { text: string; tone: "ok" | "warn" | "bad" } {
  switch (parsed.format) {
    case "canonical-v1":
      return parsed.checksumOk
        ? { text: "v1（标准）", tone: "ok" }
        : { text: "v1 校验码不匹配", tone: "bad" };
    case "legacy":
      return { text: "旧版格式（仍然可用，建议轮换）", tone: "warn" };
    default:
      return { text: "非标准格式", tone: "warn" };
  }
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

/**
 * 生成给客户端复制粘贴的 mcpServers JSON 配置（标头鉴权，推荐）。
 * 用 Authorization: Bearer 标头比 ?key= 查询参数更可靠 ——
 * 很多 MCP 客户端（如 Codex）在转发后续 JSON-RPC POST 时会丢弃 URL 上的查询字符串。
 */
export function configForKeyHeader(url: string, key: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "codeshelf-api": {
          url,
          headers: {
            Authorization: `Bearer ${key}`,
          },
        },
      },
    },
    null,
    2,
  );
}

/**
 * 兼容旧版/Web 端的查询参数鉴权配置。
 * 部分客户端不支持自定义 headers 时使用。
 */
export function configForKeyQuery(url: string, key: string) {
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

/** Codex 推荐 TOML（标头鉴权）。 */
export function codexTomlHeader(url: string, key: string) {
  return [
    `[mcp_servers.codeshelf-api]`,
    `url = "${url}"`,
    ``,
    `[mcp_servers.codeshelf-api.headers]`,
    `Authorization = "Bearer ${key}"`,
  ].join("\n");
}

/** Codex 兼容 TOML（查询参数鉴权，仅在客户端不支持标头时使用）。 */
export function codexTomlQuery(url: string, key: string) {
  return `[mcp_servers.codeshelf-api]\nurl = "${url}?key=${encodeURIComponent(key)}"`;
}

/**
 * @deprecated 历史接口，等价于 {@link configForKeyQuery}。新代码请使用 configForKeyHeader / configForKeyQuery。
 */
export function configForKey(url: string, key: string) {
  return configForKeyQuery(url, key);
}

/** 把密钥中间部分用 • 替换，避免 UI 上意外被人看到/截屏。 */
export function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(Math.min(20, key.length - 10))}${key.slice(-4)}`;
}

export type KeyStrength = "empty" | "weak" | "medium" | "strong";

/**
 * 简单的密钥强度评估：
 * - 符合 v1 格式且校验通过 → 一律 strong
 * - 符合 legacy 格式且长度足够 → strong
 * - 其它情况按长度+字符种类粗判
 */
export function evaluateKeyStrength(key: string): KeyStrength {
  if (!key) return "empty";
  const parsed = parseKey(key);
  if (parsed.format === "canonical-v1" && parsed.checksumOk) return "strong";
  if (parsed.format === "legacy" && (parsed.payload?.length ?? 0) >= 32) return "strong";

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
