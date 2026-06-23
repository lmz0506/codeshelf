import path from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function durationMs(startedAt: string, finishedAt: string): number {
  return Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
}

export function countChars(value: unknown): number {
  if (typeof value === "string") return [...value].length;
  return [...JSON.stringify(value, null, 2)].length;
}

export function normalizeVirtualPath(input?: string | null): string {
  const raw = (input || "/").replaceAll("\\", "/").trim();
  const withRoot = raw.startsWith("/") ? raw : `/${raw}`;
  return path.posix.normalize(withRoot);
}

export function limitText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if ([...text].length <= maxChars) return { text, truncated: false };
  return { text: [...text].slice(0, maxChars).join("") + "\n[truncated]", truncated: true };
}

export function jsonArtifact(value: unknown): string {
  return JSON.stringify(toJsonSafe(value), null, 2);
}

export function toJsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const text = JSON.stringify(value, (key, item) => {
    if (isSensitiveJsonKey(key)) return "[redacted]";
    if (typeof item === "bigint") return item.toString();
    if (typeof item === "function") return `[Function ${item.name || "anonymous"}]`;
    if (item instanceof Error) {
      return { name: item.name, message: item.message, stack: item.stack };
    }
    if (item && typeof item === "object") {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  });
  return text === undefined ? null : JSON.parse(text);
}

function isSensitiveJsonKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll("_", "").replaceAll("-", "");
  return [
    "apikey",
    "authorization",
    "accesstoken",
    "refreshtoken",
    "secret",
    "password",
    "bearertoken",
  ].some((item) => normalized.includes(item));
}
