// 平台检测：给 React useState 初始值用的同步推断。
// 注意 tauri.conf.json 把 userAgent 自定义成了 "CodeShelf-Tauri-Webview/1.0"，
// 所以不能再用 navigator.userAgent；改走 navigator.platform（macOS 返回 "MacIntel"，
// Windows 返回 "Win32/Win64"，Linux 返回 "Linux ..."）。
// 后端 get_current_platform 仍是权威来源，异步加载后会覆盖。

export type Platform = "windows" | "macos" | "linux";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const platform = (navigator.platform || "").toLowerCase();
  if (platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad")) {
    return "macos";
  }
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux")) return "linux";

  // 兜底：navigator.platform 在某些环境可能为空，再读一次 userAgent。
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  return "linux";
}

export const IS_MAC = detectPlatform() === "macos";
export const IS_WINDOWS = detectPlatform() === "windows";
export const IS_LINUX = detectPlatform() === "linux";
