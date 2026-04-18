export type SlashCommandId =
  | "clear"
  | "new"
  | "export"
  | "exportJson"
  | "import"
  | "system"
  | "config"
  | "model"
  | "regenerate"
  | "compact"
  | "skills"
  | "tool"
  | "help";

export interface SlashCommand {
  id: SlashCommandId;
  name: string;
  description: string;
  aliases?: string[];
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "clear", name: "/clear", description: "清空当前会话的全部消息（保留会话）" },
  { id: "new", name: "/new", description: "创建一个新会话" },
  { id: "export", name: "/export", description: "导出当前会话为 Markdown 文件" },
  { id: "exportJson", name: "/export-json", description: "导出当前会话为 JSON 文件", aliases: ["/export.json"] },
  { id: "import", name: "/import", description: "从 JSON 文件导入会话" },
  { id: "system", name: "/system", description: "编辑系统提示词（System Prompt）" },
  { id: "config", name: "/config", description: "调整温度、max tokens 等采样参数" },
  { id: "model", name: "/model", description: "切换模型（聚焦顶部选择器）" },
  { id: "regenerate", name: "/regenerate", description: "对最后一条 assistant 消息重新生成", aliases: ["/regen"] },
  { id: "compact", name: "/compact", description: "压缩早期对话为摘要，保留最近 4 条" },
  { id: "skills", name: "/skills", description: "打开 Skills / Prompt 库选择器" },
  { id: "tool", name: "/tool", description: "选择一个工具，输入框自动插入工具 hint 前缀" },
  { id: "help", name: "/help", description: "列出全部可用命令" },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q || q === "/") return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.name.toLowerCase().includes(q)) return true;
    if (cmd.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });
}

export function matchSlashCommand(raw: string): SlashCommand | null {
  const trimmed = raw.trim().toLowerCase();
  for (const cmd of SLASH_COMMANDS) {
    if (trimmed === cmd.name.toLowerCase()) return cmd;
    if (cmd.aliases?.some((a) => a.toLowerCase() === trimmed)) return cmd;
  }
  return null;
}
