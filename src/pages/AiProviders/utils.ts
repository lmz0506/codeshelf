import { readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { AiModelConfig, AiProviderConfig, ChatMessage } from "@/types";

export interface ModelOption {
  providerId: string;
  providerName: string;
  modelId: string;
  model: AiModelConfig;
  baseUrl: string;
  apiKey?: string;
  key: string;
}

export interface AttachedFile {
  name: string;
  content: string;
  path: string;
  enabled: boolean;
}

export const TEXT_EXTENSIONS = [
  "txt", "md", "json", "js", "ts", "tsx", "jsx", "py", "java",
  "c", "cpp", "h", "hpp", "rs", "go", "rb", "php", "html", "css",
  "scss", "less", "xml", "yaml", "yml", "toml", "ini", "cfg",
  "sh", "bash", "zsh", "sql", "vue", "svelte", "swift", "kt",
  "csv", "log", "env", "conf", "gitignore", "dockerfile",
];

export function buildModelOptions(providers: AiProviderConfig[]): ModelOption[] {
  const options: ModelOption[] = [];
  for (const p of providers) {
    if (!p.enabled) continue;
    for (const m of p.models) {
      if (!m.enabled) continue;
      options.push({
        providerId: p.id,
        providerName: p.name,
        modelId: m.id,
        model: m,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        key: `${p.id}:${m.id}`,
      });
    }
  }
  options.sort((a, b) => {
    const aProvider = providers.find((p) => p.id === a.providerId);
    const bProvider = providers.find((p) => p.id === b.providerId);
    const aIsDefaultProvider = aProvider?.isDefaultProvider ? 1 : 0;
    const bIsDefaultProvider = bProvider?.isDefaultProvider ? 1 : 0;
    if (aIsDefaultProvider !== bIsDefaultProvider) return bIsDefaultProvider - aIsDefaultProvider;
    const aIsDefault = a.model.isDefault ? 1 : 0;
    const bIsDefault = b.model.isDefault ? 1 : 0;
    if (aIsDefault !== bIsDefault) return bIsDefault - aIsDefault;
    return 0;
  });
  return options;
}

export function getDefaultOptionKey(providers: AiProviderConfig[]): string | null {
  const defaultProvider = providers.filter((p) => p.enabled).find((p) => p.isDefaultProvider) ?? providers.filter((p) => p.enabled)[0];
  if (!defaultProvider) return null;
  const defaultModel = defaultProvider.models.filter((m) => m.enabled).find((m) => m.isDefault) ?? defaultProvider.models.filter((m) => m.enabled)[0];
  if (!defaultModel) return null;
  return `${defaultProvider.id}:${defaultModel.id}`;
}

export function buildMessage(
  role: ChatMessage["role"],
  content: string,
  thinkingContent?: string,
  attachments?: Array<{ name: string; path: string }>,
): ChatMessage {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    thinkingContent,
    attachments: attachments?.map((a) => ({ kind: "file" as const, path: a.path, name: a.name })),
  };
}

export async function collectFilesFromDir(
  dirPath: string,
  extensions: string[],
  filenamePattern: string,
  mode: "extension" | "filename",
): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = await join(dirPath, entry.name);
      if (entry.isDirectory) {
        const sub = await collectFilesFromDir(fullPath, extensions, filenamePattern, mode);
        result.push(...sub);
      } else if (entry.isFile) {
        if (mode === "extension") {
          if (extensions.length === 0) {
            const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
            if (TEXT_EXTENSIONS.includes(ext)) result.push(fullPath);
          } else {
            const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
            if (extensions.includes(ext)) result.push(fullPath);
          }
        } else {
          if (!filenamePattern) {
            const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
            if (TEXT_EXTENSIONS.includes(ext)) result.push(fullPath);
          } else {
            const pattern = filenamePattern.toLowerCase();
            const name = entry.name.toLowerCase();
            if (pattern.includes("*")) {
              const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
              if (regex.test(name)) result.push(fullPath);
            } else {
              if (name.includes(pattern)) result.push(fullPath);
            }
          }
        }
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return result;
}
