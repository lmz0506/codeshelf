import { useProjectsStore } from "./projectsStore";
import { useUiStore } from "./uiStore";

export function navigateToProject(projectPath: string) {
  const project = useProjectsStore
    .getState()
    .projects.find((p) => p.path === projectPath);
  useUiStore.getState().setCurrentPage("shelf");
  if (project) {
    useProjectsStore.getState().setSelectedProjectId(project.id);
  }
}
