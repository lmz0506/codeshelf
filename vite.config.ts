import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const TAURI_UA_TOKEN = "CodeShelf-Tauri-Webview/1.0";

// 仅允许 Tauri webview 访问 dev server，浏览器直连返回 403
const restrictToTauri = () => ({
  name: "restrict-to-tauri",
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const ua = req.headers["user-agent"] || "";
      if (ua.includes(TAURI_UA_TOKEN)) return next();
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("403 Forbidden: this dev server is only accessible from the Tauri webview.");
    });
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const ua = req.headers["user-agent"] || "";
      if (ua.includes(TAURI_UA_TOKEN)) return next();
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("403 Forbidden");
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), restrictToTauri()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // 调整警告阈值（可选）
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React 核心库
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          // Tauri API
          if (id.includes('node_modules/@tauri-apps')) {
            return 'vendor-tauri';
          }
          // 图标库
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          // 代码高亮库（较大）
          if (id.includes('node_modules/highlight.js') || id.includes('node_modules/lowlight')) {
            return 'vendor-highlight';
          }
          // Markdown 相关
          if (id.includes('node_modules/react-markdown') ||
              id.includes('node_modules/remark') ||
              id.includes('node_modules/rehype') ||
              id.includes('node_modules/unified') ||
              id.includes('node_modules/mdast') ||
              id.includes('node_modules/hast') ||
              id.includes('node_modules/micromark') ||
              id.includes('node_modules/unist')) {
            return 'vendor-markdown';
          }
          // 其他工具库
          if (id.includes('node_modules/zustand') ||
              id.includes('node_modules/date-fns') ||
              id.includes('node_modules/@tanstack')) {
            return 'vendor-utils';
          }
        },
      },
    },
  },
});
