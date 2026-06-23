import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import type { ChatSession } from "@/types";

function sanitizeFilename(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "chat";
}

export function sessionToMarkdown(session: ChatSession): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(`> 模型：${session.providerId} / ${session.modelId}`);
  lines.push(`> 创建：${session.createdAt}`);
  lines.push(`> 更新：${session.updatedAt}`);
  if (session.systemPrompt) {
    lines.push("");
    lines.push("## System");
    lines.push("");
    lines.push(session.systemPrompt);
  }
  for (const msg of session.messages) {
    lines.push("");
    lines.push(`## ${msg.role === "user" ? "用户" : msg.role === "assistant" ? "助手" : "系统"}`);
    lines.push("");
    if (msg.thinkingContent) {
      lines.push("<details><summary>thinking</summary>");
      lines.push("");
      lines.push(msg.thinkingContent);
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
    lines.push(msg.content);
  }
  return lines.join("\n") + "\n";
}

export async function exportSessionAsMarkdown(session: ChatSession): Promise<boolean> {
  const filename = `${sanitizeFilename(session.title)}.md`;
  const path = await save({
    title: "导出会话",
    defaultPath: filename,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return false;
  await writeTextFile(path, sessionToMarkdown(session));
  return true;
}

export async function exportSessionAsJson(session: ChatSession): Promise<boolean> {
  const filename = `${sanitizeFilename(session.title)}.json`;
  const path = await save({
    title: "导出会话（JSON）",
    defaultPath: filename,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  await writeTextFile(path, JSON.stringify(session, null, 2));
  return true;
}

export async function importSessionFromJson(): Promise<ChatSession | null> {
  const picked = await open({
    title: "导入会话",
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!picked || Array.isArray(picked)) return null;
  const content = await readTextFile(picked as string);
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object") throw new Error("JSON 格式不正确");
  if (!Array.isArray(parsed.messages)) throw new Error("缺少 messages 字段");
  if (typeof parsed.id !== "string") throw new Error("缺少 id 字段");
  if (typeof parsed.title !== "string") throw new Error("缺少 title 字段");
  return parsed as ChatSession;
}
