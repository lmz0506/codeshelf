import { invoke } from "@tauri-apps/api/core";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

function toRelPath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function isUnsafePath(rel: string): boolean {
  return rel.includes("..") || /^[a-zA-Z]:[\/\\]/.test(rel) || rel.startsWith("/");
}

export function createProjectFsTools(projectId: string) {
  const listDir = tool(
    async ({ path }: { path: string }): Promise<string> => {
      const rel = toRelPath(path);
      if (isUnsafePath(rel)) {
        return `[error] 路径不合法: ${path}`;
      }
      try {
        return await invoke<string>("resume_project_list_dir", {
          projectId,
          path: rel,
        });
      } catch (err) {
        return `[error] 读取目录失败: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: "project_list_dir",
      description:
        "列出当前书架项目内某目录下的文件与子目录（后端会校验项目路径并应用内置规则、.gitignore、.codeshelfignore）。参数 path：相对项目根的目录路径，根目录用空字符串。目录名带尾部斜杠。",
      schema: z.object({
        path: z.string().describe("相对项目根的目录路径；根目录传空字符串"),
      }),
    }
  );

  const readFile = tool(
    async ({ path }: { path: string }): Promise<string> => {
      const rel = toRelPath(path);
      if (rel === "" || isUnsafePath(rel)) {
        return `[error] 路径不合法: ${path}`;
      }
      try {
        return await invoke<string>("resume_project_read_file", {
          projectId,
          path: rel,
        });
      } catch (err) {
        return `[error] 读取文件失败: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: "project_read_file",
      description:
        "读取当前书架项目内某文件全文（后端最多返回 10000 字符；超出会截断）。命中 ignore 规则的文件会拒绝读取。",
      schema: z.object({
        path: z.string().describe("相对项目根的文件路径"),
      }),
    }
  );

  const grep = tool(
    async ({ pattern, glob }: { pattern: string; glob?: string }): Promise<string> => {
      try {
        return await invoke<string>("resume_project_grep", {
          projectId,
          pattern,
          glob,
        });
      } catch (err) {
        return `[error] 搜索失败: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: "project_grep",
      description:
        "在当前书架项目内递归搜索文本（大小写不敏感，最多 50 个匹配）。pattern 按普通文本匹配；可选 glob 限定文件名模式（如 *.ts）。后端会应用 ignore 规则。",
      schema: z.object({
        pattern: z.string().describe("要搜索的普通文本"),
        glob: z.string().optional().describe("可选的文件名 glob，如 *.ts"),
      }),
    }
  );

  return [listDir, readFile, grep];
}
