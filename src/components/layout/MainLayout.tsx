import { ReactNode, useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { useAppStore } from "@/stores/appStore";

interface MainLayoutProps {
  children: (currentPage: string) => ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [currentPage, setCurrentPage] = useState("shelf");
  const { theme } = useAppStore();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      {/* Custom Title Bar with Quick Actions */}
      <TitleBar onNavigate={setCurrentPage} currentPage={currentPage} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
        <main className="flex-1 overflow-auto bg-[var(--color-bg-secondary)]">
          {children(currentPage)}
        </main>
      </div>
    </div>
  );
}
