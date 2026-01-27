import { useState, useEffect } from "react";
import {
  FolderGit2,
  GitCommit,
  GitBranch,
  ArrowUpCircle,
} from "lucide-react";
import { CommitHeatmap } from "@/components/ui";
import { useAppStore } from "@/stores/appStore";
import { getGitStatus, getCommitHistory } from "@/services/git";
import type { DashboardStats, DailyActivity } from "@/types";

export function DashboardPage() {
  const { projects } = useAppStore();
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    todayCommits: 0,
    weekCommits: 0,
    unpushedCommits: 0,
    unmergedBranches: 0,
  });
  const [heatmapData, setHeatmapData] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [projects]);

  async function loadDashboardData() {
    try {
      setLoading(true);

      const totalProjects = projects.length;
      let unpushedCommits = 0;
      const commitsByDate: Record<string, number> = {};

      // Collect data from all projects
      await Promise.all(
        projects.map(async (project) => {
          try {
            const [status, commits] = await Promise.all([
              getGitStatus(project.path),
              getCommitHistory(project.path, 365),
            ]);

            // Count unpushed commits
            unpushedCommits += status.ahead;

            // Count commits by date
            commits.forEach((commit) => {
              const date = new Date(commit.date).toISOString().split("T")[0];
              commitsByDate[date] = (commitsByDate[date] || 0) + 1;
            });
          } catch (error) {
            console.error(`Failed to load data for ${project.name}:`, error);
          }
        })
      );

      // Calculate today and week commits
      const today = new Date().toISOString().split("T")[0];
      const todayCommits = commitsByDate[today] || 0;

      let weekCommits = 0;
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        weekCommits += commitsByDate[dateStr] || 0;
      }

      // Convert to heatmap data
      const heatmap: DailyActivity[] = Object.entries(commitsByDate).map(
        ([date, count]) => ({
          date,
          count,
        })
      );

      setStats({
        totalProjects,
        todayCommits,
        weekCommits,
        unpushedCommits,
        unmergedBranches: 0, // TODO: Implement branch tracking
      });
      setHeatmapData(heatmap);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-10">
      <h1 className="text-[var(--color-text-primary)] mb-10 text-2xl">数据统计</h1>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              icon={FolderGit2}
              label="总项目数"
              value={stats.totalProjects}
              color="blue"
            />
            <StatCard
              icon={GitCommit}
              label="今日提交"
              value={stats.todayCommits}
              color="green"
            />
            <StatCard
              icon={GitCommit}
              label="本周提交"
              value={stats.weekCommits}
              color="purple"
            />
            <StatCard
              icon={ArrowUpCircle}
              label="待推送"
              value={stats.unpushedCommits}
              color="orange"
            />
          </div>

          {/* Heatmap */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-7 mb-6 shadow-sm">
            <h2 className="text-[var(--color-text-primary)] mb-6 text-lg">编码足迹</h2>
            {heatmapData.length > 0 ? (
              <CommitHeatmap data={heatmapData} />
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)]">
                <p>暂无提交记录</p>
              </div>
            )}
          </div>

          {/* Recent Activity Placeholder */}
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-7 shadow-sm">
            <h2 className="text-[var(--color-text-primary)] mb-6 text-lg">最近活动</h2>
            <div className="flex flex-col items-center justify-center h-32 text-[var(--color-text-muted)]">
              <p>功能开发中...</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "blue" | "green" | "orange" | "purple";
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-500",
    green: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500",
    orange: "bg-orange-50 dark:bg-orange-500/10 text-orange-500",
    purple: "bg-purple-50 dark:bg-purple-500/10 text-purple-500",
  };

  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`p-3.5 rounded-xl ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[var(--color-text-tertiary)] text-sm font-medium mb-1">{label}</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
        </div>
      </div>
    </div>
  );
}
