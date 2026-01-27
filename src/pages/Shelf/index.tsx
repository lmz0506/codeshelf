import { useState, useEffect } from "react";
import {
  Search,
  Grid3X3,
  List,
  FolderPlus,
  RefreshCw,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { ProjectCard, ScanResultDialog, ProjectDetailDialog } from "@/components/project";
import { useAppStore } from "@/stores/appStore";
import type { Project, GitRepo } from "@/types";
import { getProjects, addProject } from "@/services/db";
import { scanDirectory } from "@/services/git";
import { open } from "@tauri-apps/plugin-dialog";

export function ShelfPage() {
  const {
    projects,
    setProjects,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
  } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [scanResults, setScanResults] = useState<GitRepo[] | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddProject() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });

      if (selected) {
        const path = selected as string;
        const name = path.split(/[\\/]/).pop() || "Unknown";

        const project = await addProject({
          name,
          path,
          tags: [],
        });

        setProjects([...projects, project]);
      }
    } catch (error) {
      console.error("Failed to add project:", error);
    }
  }

  async function handleScanDirectory() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要扫描的目录",
      });

      if (selected) {
        setLoading(true);
        const repos = await scanDirectory(selected as string);

        // Filter out already added projects
        const newRepos = repos.filter(
          repo => !projects.some(p => p.path === repo.path)
        );

        if (newRepos.length > 0) {
          setScanResults(newRepos);
        } else {
          // Show message that no new repos found
          alert("未找到新的 Git 仓库");
        }
      }
    } catch (error) {
      console.error("Failed to scan directory:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmScan(selectedPaths: string[]) {
    try {
      setLoading(true);
      const newProjects: Project[] = [];

      for (const path of selectedPaths) {
        const repo = scanResults?.find(r => r.path === path);
        if (repo) {
          try {
            const project = await addProject({
              name: repo.name,
              path: repo.path,
              tags: [],
            });
            newProjects.push(project);
          } catch (error) {
            console.error(`Failed to add project ${repo.name}:`, error);
          }
        }
      }

      if (newProjects.length > 0) {
        setProjects([...projects, ...newProjects]);
      }

      setScanResults(null);
    } catch (error) {
      console.error("Failed to add projects:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleProjectUpdate(updated: Project) {
    setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
  }

  // Filter projects based on search query
  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: favorites first, then by name
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between gap-6 px-8 py-5 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
        <h1 className="text-[var(--color-text-primary)] whitespace-nowrap text-xl">项目书架</h1>

        <div className="flex items-center gap-4 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <Input
              placeholder="搜索项目..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11"
            />
          </div>

          <div className="flex items-center border border-[var(--color-border)] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2.5 transition-colors ${
                viewMode === "grid"
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2.5 transition-colors ${
                viewMode === "list"
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleScanDirectory}>
            <RefreshCw className="w-4 h-4 mr-2" />
            扫描目录
          </Button>
          <Button onClick={handleAddProject}>
            <FolderPlus className="w-4 h-4 mr-2" />
            添加项目
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
            <FolderPlus className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2 text-[var(--color-text-secondary)]">还没有项目</p>
            <p className="text-sm">点击"添加项目"或"扫描目录"开始使用</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                viewMode="grid"
                onUpdate={handleProjectUpdate}
                onShowDetail={setSelectedProject}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                viewMode="list"
                onUpdate={handleProjectUpdate}
                onShowDetail={setSelectedProject}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scan Result Dialog */}
      {scanResults && (
        <ScanResultDialog
          repos={scanResults}
          onConfirm={handleConfirmScan}
          onCancel={() => setScanResults(null)}
        />
      )}

      {/* Project Detail Dialog */}
      {selectedProject && (
        <ProjectDetailDialog
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </div>
  );
}
