// 平台检测：用 navigator.userAgent 同步推断，给 React useState 初始值用。
// 后端 get_current_platform 仍是权威来源，异步加载后会覆盖。

export type Platform = "windows" | "macos" | "linux";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  return "linux";
}

export const IS_MAC = detectPlatform() === "macos";
export const IS_WINDOWS = detectPlatform() === "windows";
export const IS_LINUX = detectPlatform() === "linux";
