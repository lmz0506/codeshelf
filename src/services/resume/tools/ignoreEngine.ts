import ignore from "ignore";
import type { Ignore } from "ignore";
import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

const BUILTIN_RULES = [
  ".git/",
  "node_modules/",
  "target/",
  "dist/",
  "build/",
  ".next/",
  "out/",
  ".vscode/",
  ".idea/",
  ".DS_Store",
  "*.log",
  "*.lock",
  "*.min.js",
  "*.min.css",
  "*.map",
];

export interface IgnoreFilter {
  ignores(relPath: string, isDir: boolean): boolean;
  sources: string[];
}

function normalize(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

export async function buildIgnoreFilter(projectPath: string): Promise<IgnoreFilter> {
  const ig: Ignore = ignore().add(BUILTIN_RULES);
  const sources: string[] = ["[builtin]"];

  for (const name of [".gitignore", ".codeshelfignore"]) {
    try {
      const p = await join(projectPath, name);
      if (await exists(p)) {
        const content = await readTextFile(p);
        ig.add(content);
        sources.push(name);
      }
    } catch {
      // 单个文件读不出不影响整体
    }
  }

  return {
    sources,
    ignores(relPath, isDir) {
      const norm = normalize(relPath);
      if (norm === "" || norm === ".") return false;
      return ig.ignores(isDir ? norm + "/" : norm);
    },
  };
}
