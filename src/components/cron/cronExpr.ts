// 可复用的 cron 工具：纯函数，不依赖 React，任意页面可直接调用。
// 采用 5 段制（分 时 日 月 周），与后端 workflows.rs::to_six_field 对齐。

export type CronMode =
  | "minutely" // 每 N 分钟
  | "hourly" // 每小时第 M 分
  | "daily" // 每天 HH:MM
  | "weekly" // 每周某几天 HH:MM
  | "monthly" // 每月某日 HH:MM
  | "custom"; // 自定义原始表达式

export interface CronSpec {
  mode: CronMode;
  everyN: number; // minutely：每 N 分钟（1-59）
  minute: number; // 0-59
  hour: number; // 0-23
  dayOfMonth: number; // 1-31
  weekdays: number[]; // 0-6（0=周日）
  raw: string; // custom 原始表达式
}

export const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function defaultCronSpec(): CronSpec {
  return {
    mode: "daily",
    everyN: 5,
    minute: 0,
    hour: 9,
    dayOfMonth: 1,
    weekdays: [1],
    raw: "0 9 * * *",
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/** 由结构化配置生成 5 段 cron 字符串 */
export function buildCron(spec: CronSpec): string {
  switch (spec.mode) {
    case "minutely":
      return `*/${clampInt(spec.everyN, 1, 59)} * * * *`;
    case "hourly":
      return `${clampInt(spec.minute, 0, 59)} * * * *`;
    case "daily":
      return `${clampInt(spec.minute, 0, 59)} ${clampInt(spec.hour, 0, 23)} * * *`;
    case "weekly": {
      const days = (spec.weekdays.length ? [...new Set(spec.weekdays)] : [1])
        .sort((a, b) => a - b)
        .join(",");
      return `${clampInt(spec.minute, 0, 59)} ${clampInt(spec.hour, 0, 23)} * * ${days}`;
    }
    case "monthly":
      return `${clampInt(spec.minute, 0, 59)} ${clampInt(spec.hour, 0, 23)} ${clampInt(
        spec.dayOfMonth,
        1,
        31,
      )} * *`;
    case "custom":
    default:
      return (spec.raw || "").trim();
  }
}

function parseDowList(s: string): number[] | null {
  const out: number[] = [];
  for (const tok of s.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(tok);
    if (range) {
      let a = parseInt(range[1], 10);
      let b = parseInt(range[2], 10);
      if (a > 6 || b > 6) return null;
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) out.push(i);
    } else if (/^\d+$/.test(tok)) {
      const n = parseInt(tok, 10);
      if (n > 6) return null; // 7=周日 等写法交给 custom，保持简单
      out.push(n);
    } else {
      return null;
    }
  }
  return out.length ? [...new Set(out)].sort((a, b) => a - b) : null;
}

/** 尽力把表达式解析回结构化配置；无法识别为预设时回落 custom */
export function parseCron(expr: string): CronSpec {
  const base = defaultCronSpec();
  const e = (expr || "").trim();
  const parts = e.split(/\s+/);
  if (parts.length !== 5) {
    return { ...base, mode: "custom", raw: e };
  }
  const [mi, h, dom, mon, dow] = parts;
  const allStar = (...xs: string[]) => xs.every((x) => x === "*");
  const intOf = (s: string) => (/^\d+$/.test(s) ? parseInt(s, 10) : NaN);

  const everyMatch = /^\*\/(\d+)$/.exec(mi);
  if (everyMatch && allStar(h, dom, mon, dow)) {
    return { ...base, mode: "minutely", everyN: clampInt(parseInt(everyMatch[1], 10), 1, 59), raw: e };
  }
  if (!isNaN(intOf(mi)) && allStar(h, dom, mon, dow)) {
    return { ...base, mode: "hourly", minute: clampInt(intOf(mi), 0, 59), raw: e };
  }
  if (!isNaN(intOf(mi)) && !isNaN(intOf(h)) && allStar(dom, mon, dow)) {
    return {
      ...base,
      mode: "daily",
      minute: clampInt(intOf(mi), 0, 59),
      hour: clampInt(intOf(h), 0, 23),
      raw: e,
    };
  }
  if (!isNaN(intOf(mi)) && !isNaN(intOf(h)) && dom === "*" && mon === "*" && dow !== "*") {
    const wds = parseDowList(dow);
    if (wds) {
      return {
        ...base,
        mode: "weekly",
        minute: clampInt(intOf(mi), 0, 59),
        hour: clampInt(intOf(h), 0, 23),
        weekdays: wds,
        raw: e,
      };
    }
  }
  if (!isNaN(intOf(mi)) && !isNaN(intOf(h)) && !isNaN(intOf(dom)) && mon === "*" && dow === "*") {
    return {
      ...base,
      mode: "monthly",
      minute: clampInt(intOf(mi), 0, 59),
      hour: clampInt(intOf(h), 0, 23),
      dayOfMonth: clampInt(intOf(dom), 1, 31),
      raw: e,
    };
  }
  return { ...base, mode: "custom", raw: e };
}

/** 人话描述，给任意 5 段表达式尽力翻译 */
export function describeCron(expr: string): string {
  const e = (expr || "").trim();
  if (!e) return "未设置（仅手动触发）";
  const spec = parseCron(e);
  const hm = (h: number, m: number) => `${pad2(h)}:${pad2(m)}`;
  switch (spec.mode) {
    case "minutely":
      return `每 ${spec.everyN} 分钟一次`;
    case "hourly":
      return `每小时的第 ${spec.minute} 分`;
    case "daily":
      return `每天 ${hm(spec.hour, spec.minute)}`;
    case "weekly":
      return `每周 ${spec.weekdays.map((d) => WEEKDAY_LABELS[d]).join("、")} ${hm(spec.hour, spec.minute)}`;
    case "monthly":
      return `每月 ${spec.dayOfMonth} 号 ${hm(spec.hour, spec.minute)}`;
    default:
      return `自定义：${e}`;
  }
}
