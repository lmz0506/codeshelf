import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

const TAURI_UA_TOKEN = "CodeShelf-Tauri-Webview/1.0";

// 仅允许 Tauri webview 访问 dev/preview server，浏览器直连返回 403。
//
// 注意：这不是安全边界 —— UA 头任何本机进程都能伪造。它的作用只是：
//   1) 防止开发者误用浏览器打开 http://localhost:1420 调试，看到的资源
//      路径与 Tauri 内部不一致；
//   2) 让无意中扫描本地端口的工具拿不到完整页面。
// 真正的安全控制依赖 Tauri 的 capabilities (fs:scope / shell / asset:scope)
// 和 tauri.conf.json 里的 CSP。
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
  plugins: [
    react(),
    tailwindcss(),
    // deepagents / langchain 间接依赖了一批 Node 生态包（fast-glob、micromatch、picomatch…）
    // 这些包会用 `os.platform()` / `process.platform` / `fs` / `stream` 等 Node 内置。
    // 浏览器没有，统一用 polyfill 兜底；只 polyfill globals 中真正会被读的 Buffer/process。
    // overrides：vite-plugin-node-polyfills 自身把 `node:xxx` 在 esbuild prebundle 阶段映射到
    // node-stdlib-browser 的 polyfill，普通 resolve.alias 这时还没生效，必须用插件自己的
    // overrides 才能覆盖。下面这几个的默认 polyfill 在 deepagents/langchain 的 named import
    // 场景下不够用，所以指到本地 stub：
    //   - fs:            node-stdlib-browser 的浏览器空实现没有 constants，deepagents 顶层会读
    //                    fs.constants.O_NOFOLLOW
    //   - child_process: node-stdlib-browser 的 empty.js 没有 spawn 等 named 导出
    //   - async_hooks:   node-stdlib-browser 根本不识别这个模块（不在它的 36 模块列表里）
    //   - crypto:        crypto-browserify 缺 randomUUID（Node 14.17+ 才加）
    //   - fs/promises:   node-stdlib-browser 不支持带子路径的协议导入
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
      overrides: {
        "fs/promises": path.resolve(__dirname, "./src/shims/fs-promises-empty.js"),
        fs: path.resolve(__dirname, "./src/shims/fs-empty.js"),
        child_process: path.resolve(__dirname, "./src/shims/child-process-empty.js"),
        crypto: path.resolve(__dirname, "./src/shims/node-crypto-shim.js"),
      },
    }),
    restrictToTauri(),
  ],
  // 默认情况下 vite 的 dep scanner 会把项目里所有 .html 当作入口去扫，
  // 这样会把 docs/example/*.html 和 src-tauri/target/.../tauri-codegen-assets/*.html
  // （cargo 构建产物）一起拉进来，触发 vite-plugin-node-polyfills 的 inject 路径
  // 冲突（_buffer.js / _virtual-process-polyfill_.js 报 cannot be marked as external）。
  // 明确只扫真正的入口。
  optimizeDeps: {
    entries: ["index.html"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 这两个 node-stdlib-browser 完全不识别（不在它的模块列表 / 不支持子路径），
      // 所以放在 vite 的 resolve.alias 里，由 vite 自己的 resolver 兜底。
      "node:fs/promises": path.resolve(__dirname, "./src/shims/fs-promises-empty.js"),
      "fs/promises": path.resolve(__dirname, "./src/shims/fs-promises-empty.js"),
      "node:fs": path.resolve(__dirname, "./src/shims/fs-empty.js"),
      fs: path.resolve(__dirname, "./src/shims/fs-empty.js"),
      "node:async_hooks": path.resolve(__dirname, "./src/shims/async-hooks-shim.js"),
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
