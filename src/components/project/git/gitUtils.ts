import type { RemoteInfo } from "@/types";

export type RefType = "head" | "remote" | "tag" | "default";

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;

  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek} 周前`;

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} 个月前`;

  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear} 年前`;
}

export function getRefType(ref: string): RefType {
  const r = ref.trim().toLowerCase();
  if (r.includes("head") || r.includes("->")) return "head";
  if (r.includes("/") || r.includes("remote")) return "remote";
  if (r.includes("tag:")) return "tag";
  return "default";
}

export function cleanRefName(ref: string): string {
  return ref.replace("HEAD -> ", "").replace("tag: ", "").trim();
}

export function getRemoteType(url: string) {
  if (url.includes("github.com")) return "GitHub";
  if (url.includes("gitee.com")) return "Gitee";
  if (url.includes("gitlab")) return "GitLab";
  return "Git";
}

export function getRemoteCommitUrl(remotes: RemoteInfo[], currentRemote: string | null, hash: string): string | null {
  const remote = remotes.find((item) => item.name === currentRemote);
  if (!remote) return null;

  let url = remote.url;
  if (url.endsWith(".git")) {
    url = url.slice(0, -4);
  }

  if (url.includes("github.com")) {
    const match = url.match(/github\.com[:/](.+)$/);
    if (match) return `https://github.com/${match[1]}/commit/${hash}`;
  }

  if (url.includes("gitee.com")) {
    const match = url.match(/gitee\.com[:/](.+)$/);
    if (match) return `https://gitee.com/${match[1]}/commit/${hash}`;
  }

  if (url.includes("gitlab")) {
    const match = url.match(/gitlab[^/]*[:/](.+)$/);
    if (match) {
      const base = url.startsWith("https://")
        ? url.split(/[:/]/).slice(0, 3).join("://").replace(":///", "://")
        : "https://gitlab.com";
      return `${base}/${match[1]}/-/commit/${hash}`;
    }
  }

  return null;
}
