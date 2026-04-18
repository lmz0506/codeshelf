import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import type { ApiEndpoint, ApiGroup } from "@/types";

export interface ApiLibraryExport {
  version: 1;
  exportedAt: string;
  groups: ApiGroup[];
  endpoints: ApiEndpoint[];
}

export async function exportApiLibrary(groups: ApiGroup[], endpoints: ApiEndpoint[]): Promise<boolean> {
  const filename = `api-library-${new Date().toISOString().slice(0, 10)}.json`;
  const path = await save({
    title: "导出接口库",
    defaultPath: filename,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  const payload: ApiLibraryExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups,
    endpoints,
  };
  await writeTextFile(path, JSON.stringify(payload, null, 2));
  return true;
}

export async function importApiLibrary(): Promise<{ groups: ApiGroup[]; endpoints: ApiEndpoint[] } | null> {
  const picked = await open({
    title: "导入接口库",
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!picked || Array.isArray(picked)) return null;
  const content = await readTextFile(picked as string);
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object") throw new Error("JSON 格式不正确");
  if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.endpoints)) {
    throw new Error("缺少 groups 或 endpoints 字段");
  }
  for (const g of parsed.groups) {
    if (typeof g.id !== "string" || typeof g.name !== "string" || typeof g.baseUrl !== "string") {
      throw new Error("groups 字段结构不正确");
    }
  }
  for (const e of parsed.endpoints) {
    if (typeof e.id !== "string" || typeof e.method !== "string" || typeof e.url !== "string") {
      throw new Error("endpoints 字段结构不正确");
    }
  }
  return {
    groups: parsed.groups as ApiGroup[],
    endpoints: parsed.endpoints as ApiEndpoint[],
  };
}
