// 浏览器环境下 node:crypto 的兜底实现。
//
// 背景：
// - vite-plugin-node-polyfills 把 `node:crypto` 默认映射到 crypto-browserify，
//   但后者没有 randomUUID（Node 14.17+ 才加）和 webcrypto 等较新 API。
// - LangChain / langgraph-sdk 内部的 uuid 包会 `import { randomUUID } from 'node:crypto'`，
//   名字解析失败导致整个 bundle 崩。
// - 这里转发 crypto-browserify 的所有内容，再用 Web Crypto API 补齐缺失项。

import crypto from "crypto-browserify";

const webCrypto =
  typeof globalThis !== "undefined" && globalThis.crypto ? globalThis.crypto : null;

export const createHash = crypto.createHash;
export const Hash = crypto.Hash;
export const createHmac = crypto.createHmac;
export const Hmac = crypto.Hmac;
export const randomBytes = crypto.randomBytes;
export const pseudoRandomBytes = crypto.pseudoRandomBytes;
export const randomFillSync = crypto.randomFillSync;
export const randomFill = crypto.randomFill;
export const pbkdf2 = crypto.pbkdf2;
export const pbkdf2Sync = crypto.pbkdf2Sync;
export const createCipher = crypto.createCipher;
export const createCipheriv = crypto.createCipheriv;
export const createDecipher = crypto.createDecipher;
export const createDecipheriv = crypto.createDecipheriv;
export const getCiphers = crypto.getCiphers;
export const listCiphers = crypto.listCiphers;
export const DiffieHellmanGroup = crypto.DiffieHellmanGroup;
export const createDiffieHellmanGroup = crypto.createDiffieHellmanGroup;
export const getDiffieHellman = crypto.getDiffieHellman;
export const createDiffieHellman = crypto.createDiffieHellman;
export const DiffieHellman = crypto.DiffieHellman;
export const createSign = crypto.createSign;
export const Sign = crypto.Sign;
export const createVerify = crypto.createVerify;
export const Verify = crypto.Verify;
export const createECDH = crypto.createECDH;
export const publicEncrypt = crypto.publicEncrypt;
export const privateEncrypt = crypto.privateEncrypt;
export const publicDecrypt = crypto.publicDecrypt;
export const privateDecrypt = crypto.privateDecrypt;
export const getHashes = crypto.getHashes;

export function randomUUID() {
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  // 回退：基于 randomFillSync 的 v4 UUID
  const bytes = new Uint8Array(16);
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const webcrypto = webCrypto;

const allExports = {
  ...crypto,
  createHash,
  Hash,
  createHmac,
  Hmac,
  randomBytes,
  pseudoRandomBytes,
  randomFillSync,
  randomFill,
  randomUUID,
  pbkdf2,
  pbkdf2Sync,
  createCipher,
  createCipheriv,
  createDecipher,
  createDecipheriv,
  getCiphers,
  getHashes,
  webcrypto,
};

export default allExports;
