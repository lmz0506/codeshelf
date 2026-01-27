import {
  BookOpen,
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const navItems = [
  { id: "shelf", label: "项目书架", icon: BookOpen },
  { id: "dashboard", label: "数据统计", icon: LayoutDashboard },
  { id: "settings", label: "设置", icon: Settings },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const { sidebarCollapsed, setSidebarCollapsed } = useAppStore();

  return (
    <aside
      className={`flex flex-col bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] transition-all duration-300 ${
        sidebarCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-5 border-b border-[var(--color-border)]">
        <FolderGit2 className="w-8 h-8 text-blue-500 flex-shrink-0" />
        {!sidebarCollapsed && (
          <span className="ml-3 text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">
            CodeShelf
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full flex items-center px-3 py-3 mb-1 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="ml-3">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="flex items-center justify-center h-14 border-t border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-5 h-5" />
        ) : (
          <ChevronLeft className="w-5 h-5" />
        )}
      </button>
    </aside>
  );
}
