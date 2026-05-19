// 必须放在第一行：补全 vite-plugin-node-polyfills 注入的 process polyfill 缺失字段
// （特别是 process.versions.node，@nodelib/fs.scandir 在模块顶层就要用）
import "./shims/process-init.js";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// 生产环境禁用 DevTools
if (!import.meta.env.DEV) {
  // 禁用右键菜单（防止 Inspect Element）
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // 拦截 DevTools 快捷键
  document.addEventListener("keydown", (e) => {
    // F12
    if (e.key === "F12") { e.preventDefault(); return; }
    // Ctrl/Cmd + Shift + I / C / J
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "i", "C", "c", "J", "j"].includes(e.key)) {
      e.preventDefault();
    }
  });
}

console.log("Frontend starting...");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log("Frontend rendered");
