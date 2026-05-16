import { executeTool, readMentionFile } from "@/services/chat";
import { trimMentionPunctuation, unescapeMentionPath } from "./chatHelpers";

export async function resolveMentions(text: string, root: string | undefined): Promise<string> {
  if (!root) return "";
  const re = /(?:^|[\s(（[{])@(?:"((?:\\.|[^"\\])*)"|([^\s@]+))/gu;
  const paths = new Set<string>();
  for (const m of text.matchAll(re)) {
    const raw = m[1] ? unescapeMentionPath(m[1]) : trimMentionPunctuation(m[2] ?? "");
    if (raw) paths.add(raw);
  }
  if (paths.size === 0) return "";
  const parts: string[] = ["[引用文件]"];
  for (const p of paths) {
    try {
      const content = await readMentionFile(root, p);
      if (content.startsWith("[引用目录]")) {
        parts.push(`\n### ${p}\n${content}`);
      } else {
        parts.push(`\n### ${p}\n\`\`\`\`\n${content}\n\`\`\`\``);
      }
    } catch {
      // 跳过无法读取的
    }
  }
  return parts.length > 1 ? parts.join("\n") : "";
}

/** 从文本里识别 http(s) URL，预抓取内容并拼成 system 片段。 */
export async function resolveUrls(text: string, sessionId: string): Promise<string> {
  const re = /\bhttps?:\/\/[^\s<>"'）)）】」>]+/gi;
  const urls = Array.from(new Set(text.match(re) ?? []));
  if (urls.length === 0) return "";
  const parts: string[] = ["[抓取的网页内容]"];
  for (const url of urls.slice(0, 5)) {
    try {
      const result = await executeTool({
        sessionId,
        toolName: "WebFetch",
        argumentsJson: JSON.stringify({ url, max_bytes: 400000 }),
      });
      parts.push(`\n### ${url}\n${result}`);
    } catch (err) {
      parts.push(`\n### ${url}\n抓取失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return parts.length > 1 ? parts.join("\n") : "";
}
