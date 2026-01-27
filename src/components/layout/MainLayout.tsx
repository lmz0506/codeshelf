import { ReactNode, useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
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
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="flex-1 overflow-auto bg-[var(--color-bg-secondary)]">
        {children(currentPage)}
      </main>
    </div>
  );
}
