import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X, Maximize2, Minimize2 } from "lucide-react";

interface MacWindowControlsProps {}

export function MacWindowControls({}: MacWindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    checkMaximized();
    const handleResize = () => checkMaximized();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function checkMaximized() {
    const maximized = await getCurrentWindow().isMaximized();
    setIsMaximized(maximized);
  }

  return (
    <div className="mac-window-controls">
      <button
        onClick={() => getCurrentWindow()?.minimize()}
        className="mac-btn mac-btn-minimize"
        title="最小化"
      >
        <Minus size={10} />
      </button>
      <button
        onClick={async () => {
          await getCurrentWindow().toggleMaximize();
          checkMaximized();
        }}
        className="mac-btn mac-btn-maximize"
        title={isMaximized ? "还原" : "最大化"}
      >
        {isMaximized ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
      </button>
      <button
        onClick={() => getCurrentWindow()?.close()}
        className="mac-btn mac-btn-close"
        title="关闭"
      >
        <X size={10} />
      </button>
    </div>
  );
}
