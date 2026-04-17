import type { ChatSessionSummary } from "@/types";

export type SessionGroupKey = "pinned" | "today" | "yesterday" | "week" | "earlier";

export interface SessionGroup {
  key: SessionGroupKey;
  label: string;
  sessions: ChatSessionSummary[];
}

function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function groupSessions(sessions: ChatSessionSummary[]): SessionGroup[] {
  const pinned: ChatSessionSummary[] = [];
  const today: ChatSessionSummary[] = [];
  const yesterday: ChatSessionSummary[] = [];
  const week: ChatSessionSummary[] = [];
  const earlier: ChatSessionSummary[] = [];

  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

  for (const s of sessions) {
    if (s.pinned) {
      pinned.push(s);
      continue;
    }
    const t = new Date(s.updatedAt).getTime();
    if (Number.isNaN(t)) {
      earlier.push(s);
    } else if (t >= todayStart) {
      today.push(s);
    } else if (t >= yesterdayStart) {
      yesterday.push(s);
    } else if (t >= weekStart) {
      week.push(s);
    } else {
      earlier.push(s);
    }
  }

  const sortDesc = (arr: ChatSessionSummary[]) =>
    arr.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0));

  const result: SessionGroup[] = [];
  if (pinned.length) result.push({ key: "pinned", label: "置顶", sessions: sortDesc(pinned) });
  if (today.length) result.push({ key: "today", label: "今天", sessions: sortDesc(today) });
  if (yesterday.length) result.push({ key: "yesterday", label: "昨天", sessions: sortDesc(yesterday) });
  if (week.length) result.push({ key: "week", label: "本周内", sessions: sortDesc(week) });
  if (earlier.length) result.push({ key: "earlier", label: "更早", sessions: sortDesc(earlier) });
  return result;
}
