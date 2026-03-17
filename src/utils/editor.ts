import type { Project } from "@/types";
import type { EditorConfig } from "@/stores/appStore";

/**
 * 获取项目应使用的编辑器路径
 * 优先使用项目级 editorId 对应的编辑器，否则返回全局默认（editors[0]）
 */
export function getEditorForProject(
  project: Project,
  editors: EditorConfig[]
): string | undefined {
  if (project.editorId) {
    const matched = editors.find((e) => e.id === project.editorId);
    if (matched) return matched.path;
  }
  return editors[0]?.path;
}

/**
 * 获取项目当前使用的编辑器配置对象
 */
export function getEditorConfigForProject(
  project: Project,
  editors: EditorConfig[]
): EditorConfig | undefined {
  if (project.editorId) {
    const matched = editors.find((e) => e.id === project.editorId);
    if (matched) return matched;
  }
  return editors[0];
}

/** 已知编辑器名称 → 图标映射 */
const EDITOR_ICONS: Record<string, string> = {
  // VS Code 系列
  "vscode": "𝗩𝗦",
  "vs code": "𝗩𝗦",
  "visual studio code": "𝗩𝗦",
  "code": "𝗩𝗦",
  "cursor": "⌭",
  "windsurf": "🏄",
  // JetBrains 系列
  "idea": "IJ",
  "intellij": "IJ",
  "intellij idea": "IJ",
  "webstorm": "WS",
  "pycharm": "PC",
  "goland": "GL",
  "rustrover": "RR",
  "clion": "CL",
  "phpstorm": "PS",
  "rider": "RD",
  "datagrip": "DG",
  "android studio": "AS",
  // 其他
  "sublime": "SL",
  "sublime text": "SL",
  "vim": "Vi",
  "neovim": "NV",
  "nvim": "NV",
  "emacs": "Em",
  "atom": "At",
  "fleet": "Fl",
  "zed": "Ze",
  "notepad++": "N+",
  "xcode": "Xc",
  "nova": "No",
};

/**
 * 根据编辑器名称获取显示图标文字
 * 优先匹配已知编辑器，否则返回名称前2个字符的大写缩写
 */
export function getEditorIcon(name: string): string {
  const lower = name.toLowerCase().trim();
  for (const [key, icon] of Object.entries(EDITOR_ICONS)) {
    if (lower === key || lower.includes(key)) {
      return icon;
    }
  }
  // 取前两个非空字符作为缩写
  const chars = name.trim().replace(/\s+/g, "");
  return chars.slice(0, 2).toUpperCase();
}
