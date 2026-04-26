import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { resolveResource } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  version?: string;
  date?: string;
  body?: string;
  isPortable?: boolean;
}

// 缓存已检查的更新对象，以及已完成下载、可安装的更新对象
let cachedUpdate: Update | null = null;
let downloadedUpdate: Update | null = null;
let isPortableVersion: boolean | null = null;

// 检查是否为便携版
export async function checkIsPortable(): Promise<boolean> {
  if (isPortableVersion !== null) {
    return isPortableVersion;
  }
  try {
    // 检查 .portable 标记文件
    const portablePath = await resolveResource(".portable");
    isPortableVersion = await exists(portablePath);
  } catch {
    // 尝试检查可执行文件同目录下的 .portable 文件
    try {
      isPortableVersion = await exists(".portable");
    } catch {
      isPortableVersion = false;
    }
  }
  return isPortableVersion;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  // 便携版跳过更新检查
  const portable = await checkIsPortable();
  if (portable) {
    return {
      available: false,
      currentVersion: "",
      isPortable: true,
    };
  }

  try {
    const update = await check();
    cachedUpdate = update;
    if (!update || downloadedUpdate?.version !== update.version) {
      downloadedUpdate = null;
    }

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
    downloadedUpdate = null;
  }

  const update = cachedUpdate;
  let downloaded = 0;
  let contentLength = 0;

  await update.download((event) => {
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
  downloadedUpdate = update;
}

// 安装已下载的更新并重启
export async function installUpdate(): Promise<void> {
  if (!downloadedUpdate) {
    throw new Error("No update downloaded");
  }
  await downloadedUpdate.install();
  downloadedUpdate = null;
  await relaunch();
}

// 下载并安装更新（保留原有功能）
export async function downloadAndInstallUpdate(
  onProgress?: (progress: number, total: number) => void
): Promise<void> {
  let update = cachedUpdate;
  if (!update) {
    update = await check();
    if (!update) {
      throw new Error("No update available");
    }
    cachedUpdate = update;
  }

  let downloaded = 0;
  let contentLength = 0;

  await update.downloadAndInstall((event) => {
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
  downloadedUpdate = null;
  await relaunch();
}
