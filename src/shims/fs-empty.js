// 浏览器环境下 node:fs 的最小实现。
// deepagents 顶层会读取 fs.constants.O_* 来定义 FilesystemBackend；
// 当前应用不启用 FilesystemBackend，真实项目读取走 Tauri command。

const unsupported = (name) => () => {
  throw new Error(`node:fs.${name} 在浏览器环境下不可用`);
};

export const constants = {
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 0x40,
  O_TRUNC: 0x200,
  O_NOFOLLOW: 0x20000,
};

export const existsSync = () => false;
export const readFileSync = unsupported("readFileSync");
export const writeFileSync = unsupported("writeFileSync");
export const readdirSync = unsupported("readdirSync");
export const statSync = unsupported("statSync");
export const lstatSync = unsupported("lstatSync");
export const mkdirSync = unsupported("mkdirSync");
export const rmSync = unsupported("rmSync");
export const unlinkSync = unsupported("unlinkSync");
export const realpathSync = unsupported("realpathSync");
export const createReadStream = unsupported("createReadStream");
export const createWriteStream = unsupported("createWriteStream");

export default {
  constants,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  lstatSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  realpathSync,
  createReadStream,
  createWriteStream,
};
