import { useEffect, useRef } from "react";
import { listDirEntries, readMentionFile } from "@/services/chat";

/**
 * 构建项目上下文（目录路径 + 浅层文件树 + CLAUDE.md/README.md 摘要），
 * 返回一个 ref，包含可注入到 system 的字符串。
 */
export function useProjectContext(sessionId: string | undefined, cwd: string | undefined) {
  const projectContextRef = useRef<string>("");

  useEffect(() => {
    if (!cwd) {
      projectContextRef.current = "";
      return;
    }
    let cancelled = false;
    (async () => {
      const parts: string[] = [`[项目上下文]\n项目根目录: ${cwd}`];
      try {
        const entries = await listDirEntries(cwd, 200);
        if (entries.length > 0) {
          const lines = entries
            .slice(0, 120)
            .map((e) => (e.isDir ? `${e.path}/` : e.path));
          const more = entries.length > 120 ? `\n…（共 ${entries.length} 项，已截断）` : "";
          parts.push(`## 文件树（浅层，隐藏文件与 node_modules/target/dist 已过滤）\n${lines.join("\n")}${more}`);
        }
      } catch { /* ignore */ }

      const docCandidates = ["CLAUDE.md", "AGENTS.md", "README.md", "README"];
      for (const name of docCandidates) {
        try {
          const content = await readMentionFile(cwd, name);
          if (content && content.trim()) {
            const MAX = 8000;
            const trimmed = content.length > MAX ? content.slice(0, MAX) + "\n…（已截断）" : content;
            parts.push(`## ${name}\n${trimmed}`);
            break;
          }
        } catch { /* next */ }
      }

      if (!cancelled) projectContextRef.current = parts.join("\n\n");
    })();
    return () => { cancelled = true; };
  }, [sessionId, cwd]);

  return projectContextRef;
}
