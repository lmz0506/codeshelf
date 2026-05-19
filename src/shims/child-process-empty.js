// 浏览器环境下 node:child_process 的空实现。
// deepagents 仅在 FilesystemBackend / Sandbox 路径下用到子进程，我们没启用，
// 所以 stub 的所有函数都抛错以便发现误用。

const unsupported = (name) => () => {
  throw new Error(`node:child_process.${name} 在浏览器环境下不可用`);
};

export const spawn = unsupported("spawn");
export const exec = unsupported("exec");
export const execFile = unsupported("execFile");
export const fork = unsupported("fork");
export const spawnSync = unsupported("spawnSync");
export const execSync = unsupported("execSync");
export const execFileSync = unsupported("execFileSync");

export default {
  spawn,
  exec,
  execFile,
  fork,
  spawnSync,
  execSync,
  execFileSync,
};
