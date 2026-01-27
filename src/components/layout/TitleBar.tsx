import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Search, Settings as SettingsIcon } from "lucide-react";

interface TitleBarProps {
  onNavigate?: (page: string) => void;
  currentPage?: string;
}

export function TitleBar({ onNavigate, currentPage }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    checkMaximized();
  }, []);

  async function checkMaximized() {
    const appWindow = getCurrentWindow();
    const maximized = await appWindow.isMaximized();
    setIsMaximized(maximized);
  }

  async function handleMinimize(e: React.MouseEvent) {
    e.stopPropagation();
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  }

  async function handleMaximize(e: React.MouseEvent) {
    e.stopPropagation();
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    checkMaximized();
  }

  async function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    const appWindow = getCurrentWindow();
    await appWindow.close();
  }

  return (
    <div
      data-tauri-drag-region
      className="titlebar flex items-center justify-between h-8 bg-[var(--card)] border-b border-[var(--border)] select-none z-20"
    >
      {/* Left: App Icon and Title */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-3 flex-1 h-full"
      >
        <img
          src="/favicon.svg"
          alt="CodeShelf"
          className="w-4 h-4 pointer-events-none"
        />
        <span className="text-xs font-medium text-[var(--text-light)] pointer-events-none">
          CodeShelf · 代码书架
        </span>
      </div>

      {/* Center: Quick Actions (Optional) - styled like example but keeping current logic */}
      {onNavigate && (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("shelf");
            }}
            className={`px-3 py-1 text-xs rounded transition-all ${currentPage === "shelf"
                ? "bg-[var(--primary-light)] text-[var(--primary)]"
                : "text-[var(--text-light)] hover:text-[var(--primary)] hover:bg-[var(--primary-light)]"
              }`}
            title="项目书架"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("settings");
            }}
            className={`px-3 py-1 text-xs rounded transition-all ${currentPage === "settings"
                ? "bg-[var(--primary-light)] text-[var(--primary)]"
                : "text-[var(--text-light)] hover:text-[var(--primary)] hover:bg-[var(--primary-light)]"
              }`}
            title="设置"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Right: Window Controls */}
      <div className="flex items-center h-full">
        <button
          onClick={handleMinimize}
          className="h-full px-3.5 text-[var(--text-light)] hover:bg-[rgba(0,0,0,0.05)] transition-colors flex items-center justify-center"
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-3.5 text-[var(--text-light)] hover:bg-[rgba(0,0,0,0.05)] transition-colors flex items-center justify-center"
          title={isMaximized ? "还原" : "最大化"}
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="h-full px-3.5 text-[var(--text-light)] hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
