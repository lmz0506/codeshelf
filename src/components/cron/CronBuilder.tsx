import { useEffect, useState } from "react";
import {
  buildCron,
  parseCron,
  describeCron,
  WEEKDAY_LABELS,
  type CronMode,
  type CronSpec,
} from "./cronExpr";

interface Props {
  /** 当前 cron 字符串（5 段；空串表示仅手动） */
  value: string;
  /** cron 变化时回调 */
  onChange: (cron: string) => void;
  className?: string;
}

const MODE_OPTIONS: { value: CronMode; label: string }[] = [
  { value: "minutely", label: "每 N 分钟" },
  { value: "hourly", label: "每小时" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "custom", label: "自定义" },
];

const numCls = "w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs";

/**
 * 可复用 cron 生成器：预设（每N分/每小时/每天/每周/每月）+ 自定义，
 * 实时输出 5 段 cron 并给出人话预览。纯展示组件，不含业务逻辑。
 */
export function CronBuilder({ value, onChange, className }: Props) {
  const [spec, setSpec] = useState<CronSpec>(() => parseCron(value));

  // 外部 value 变化（如打开已有工作流）时同步；若与当前 spec 生成结果一致则不打断编辑
  useEffect(() => {
    setSpec((prev) => (buildCron(prev) === (value || "").trim() ? prev : parseCron(value)));
  }, [value]);

  function update(patch: Partial<CronSpec>) {
    setSpec((prev) => {
      const next = { ...prev, ...patch };
      onChange(buildCron(next));
      return next;
    });
  }

  function selectMode(mode: CronMode) {
    if (mode === "custom") {
      // 切到自定义时，用当前生成的 cron 作为初始原始值，避免清空
      setSpec((prev) => {
        const raw = buildCron(prev) || prev.raw;
        const next = { ...prev, mode, raw };
        onChange(raw);
        return next;
      });
    } else {
      update({ mode });
    }
  }

  function toggleWeekday(idx: number) {
    setSpec((prev) => {
      const set = new Set(prev.weekdays);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      const arr = [...set].sort((a, b) => a - b);
      const next = { ...prev, weekdays: arr.length ? arr : [idx] };
      onChange(buildCron(next));
      return next;
    });
  }

  const cron = buildCron(spec);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1">
        {MODE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`text-xs px-2 py-1 rounded border ${
              spec.mode === o.value
                ? "bg-blue-500 text-white border-blue-500"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            onClick={() => selectMode(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-gray-700">
        {spec.mode === "minutely" && (
          <label className="flex items-center gap-1">
            每
            <input
              type="number"
              min={1}
              max={59}
              value={spec.everyN}
              onChange={(e) => update({ everyN: Number(e.target.value) })}
              className={numCls}
            />
            分钟
          </label>
        )}

        {spec.mode === "hourly" && (
          <label className="flex items-center gap-1">
            每小时的第
            <input
              type="number"
              min={0}
              max={59}
              value={spec.minute}
              onChange={(e) => update({ minute: Number(e.target.value) })}
              className={numCls}
            />
            分
          </label>
        )}

        {(spec.mode === "daily" || spec.mode === "weekly" || spec.mode === "monthly") && (
          <label className="flex items-center gap-1">
            时间
            <input
              type="number"
              min={0}
              max={23}
              value={spec.hour}
              onChange={(e) => update({ hour: Number(e.target.value) })}
              className={numCls}
            />
            :
            <input
              type="number"
              min={0}
              max={59}
              value={spec.minute}
              onChange={(e) => update({ minute: Number(e.target.value) })}
              className={numCls}
            />
          </label>
        )}

        {spec.mode === "monthly" && (
          <label className="flex items-center gap-1">
            每月
            <input
              type="number"
              min={1}
              max={31}
              value={spec.dayOfMonth}
              onChange={(e) => update({ dayOfMonth: Number(e.target.value) })}
              className={numCls}
            />
            号
          </label>
        )}

        {spec.mode === "weekly" && (
          <div className="flex items-center gap-1 flex-wrap">
            {WEEKDAY_LABELS.map((lbl, idx) => (
              <button
                key={idx}
                type="button"
                className={`px-1.5 py-0.5 rounded border text-[11px] ${
                  spec.weekdays.includes(idx)
                    ? "bg-blue-500 text-white border-blue-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
                onClick={() => toggleWeekday(idx)}
              >
                {lbl.replace("周", "")}
              </button>
            ))}
          </div>
        )}

        {spec.mode === "custom" && (
          <input
            value={spec.raw}
            onChange={(e) => {
              const raw = e.target.value;
              setSpec((prev) => ({ ...prev, raw }));
              onChange(raw.trim());
            }}
            placeholder="5 段：分 时 日 月 周，如 0 9 * * 1-5"
            className="flex-1 min-w-[180px] font-mono text-xs border border-gray-200 rounded px-2 py-1"
          />
        )}
      </div>

      <div className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
        <span>{describeCron(cron)}</span>
        <span className="font-mono bg-gray-100 rounded px-1.5 py-0.5">
          {cron || "（空：仅手动）"}
        </span>
      </div>
    </div>
  );
}
