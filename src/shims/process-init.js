// vite-plugin-node-polyfills 注入的 process polyfill 把 `process.versions` 设成空对象 `{}`，
// 但 deepagents → fast-glob → @nodelib/fs.scandir/out/constants.js 在模块顶层就需要
// `process.versions.node.split('.')`。这里在所有业务模块加载之前补上 versions.node。
//
// 必须作为 src/main.tsx 的第一个 import。

if (typeof globalThis !== "undefined") {
  if (!globalThis.process) {
    globalThis.process = {
      env: {},
      argv: [],
      pid: 0,
      cwd: () => "/",
      nextTick: (fn, ...args) =>
        Promise.resolve().then(() => fn(...args)),
    };
  }
  const p = globalThis.process;
  p.versions = p.versions || {};
  if (!p.versions.node) p.versions.node = "20.0.0";
  if (!p.platform) p.platform = "linux";
  if (!p.version) p.version = "v20.0.0";
  if (!p.env) p.env = {};
  if (typeof p.cwd !== "function") p.cwd = () => "/";
  if (typeof p.nextTick !== "function") {
    p.nextTick = (fn, ...args) => Promise.resolve().then(() => fn(...args));
  }
}
