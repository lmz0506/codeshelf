// 浏览器环境下 node:fs/promises 的空实现。
// deepagents 顶层 import 它给 FilesystemBackend 用，但我们不启用 FilesystemBackend，
// 所以只需让 import 能被解析；任何调用都会抛错（方便发现误用）。

const unsupported = (name) => () => {
  throw new Error(`node:fs/promises.${name} 在浏览器环境下不可用`);
};

export const readFile = unsupported("readFile");
export const writeFile = unsupported("writeFile");
export const readdir = unsupported("readdir");
export const stat = unsupported("stat");
export const lstat = unsupported("lstat");
export const mkdir = unsupported("mkdir");
export const rm = unsupported("rm");
export const unlink = unsupported("unlink");
export const access = unsupported("access");
export const copyFile = unsupported("copyFile");
export const rename = unsupported("rename");
export const realpath = unsupported("realpath");
export const open = unsupported("open");

export default {
  readFile,
  writeFile,
  readdir,
  stat,
  lstat,
  mkdir,
  rm,
  unlink,
  access,
  copyFile,
  rename,
  realpath,
  open,
};
