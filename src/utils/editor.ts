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
