import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  version?: string;
  date?: string;
  body?: string;
}

// 缓存已检查的更新对象
let cachedUpdate: Update | null = null;

export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const update = await check();
    cachedUpdate = update;

    if (update) {
      return {
        available: true,
        currentVersion: update.currentVersion,
        version: update.version,
        date: update.date,
        body: update.body,
      };
    }

    return {
      available: false,
      currentVersion: "",
    };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    throw error;
  }
}

// 静默检查更新（不抛出错误）
export async function silentCheckForUpdates(): Promise<UpdateInfo | null> {
  try {
    return await checkForUpdates();
  } catch (error) {
    console.error("Silent update check failed:", error);
    return null;
  }
}

// 仅下载更新（不安装）
export async function downloadUpdate(
  onProgress?: (progress: number, total: number) => void
): Promise<void> {
  if (!cachedUpdate) {
    const update = await check();
    if (!update) {
      throw new Error("No update available");
    }
    cachedUpdate = update;
  }

  let downloaded = 0;
  let contentLength = 0;

  await cachedUpdate.download((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength || 0;
        console.log(`Started downloading ${contentLength} bytes`);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        if (onProgress && contentLength > 0) {
          onProgress(downloaded, contentLength);
        }
        console.log(`Downloaded ${downloaded} of ${contentLength}`);
        break;
      case "Finished":
        console.log("Download finished");
        break;
    }
  });
}

// 安装已下载的更新并重启
export async function installUpdate(): Promise<void> {
  if (!cachedUpdate) {
    throw new Error("No update downloaded");
  }
  await cachedUpdate.install();
  await relaunch();
}

// 下载并安装更新（保留原有功能）
export async function downloadAndInstallUpdate(
  onProgress?: (progress: number, total: number) => void
): Promise<void> {
  await downloadUpdate(onProgress);
  await installUpdate();
}
