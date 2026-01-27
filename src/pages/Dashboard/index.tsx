import {
  FolderGit2,
  GitCommit,
  GitBranch,
  ArrowUpCircle,
} from "lucide-react";

export function DashboardPage() {
  // Mock data for now
  const stats = {
    totalProjects: 0,
    todayCommits: 0,
    weekCommits: 0,
    unpushedCommits: 0,
    unmergedBranches: 0,
  };

  return (
    <div className="flex flex-col h-full p-10">
      <h1 className="text-[var(--color-text-primary)] mb-10 text-2xl">数据统计</h1>

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
          icon={ArrowUpCircle}
          label="待推送"
          value={stats.unpushedCommits}
          color="orange"
        />
        <StatCard
          icon={GitBranch}
          label="未合并分支"
          value={stats.unmergedBranches}
          color="purple"
        />
      </div>

      {/* Heatmap Placeholder */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-7 mb-6 shadow-sm">
        <h2 className="text-[var(--color-text-primary)] mb-6 text-lg">编码足迹</h2>
        <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)]">
          <p>热力图将在添加项目后显示</p>
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-7 shadow-sm">
        <h2 className="text-[var(--color-text-primary)] mb-6 text-lg">最近活动</h2>
        <div className="flex flex-col items-center justify-center h-32 text-[var(--color-text-muted)]">
          <p>暂无活动记录</p>
        </div>
      </div>
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
