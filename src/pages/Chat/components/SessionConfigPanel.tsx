import { useEffect, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import type { ChatSession } from "@/types";

export interface SessionConfigValues {
  systemPrompt: string;
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
}

interface SessionConfigPanelProps {
  open: boolean;
  session: ChatSession | null;
  focus?: "system" | "params";
  onClose: () => void;
  onSave: (values: SessionConfigValues) => void;
}

function toValues(session: ChatSession | null): SessionConfigValues {
  return {
    systemPrompt: session?.systemPrompt ?? "",
    temperature: session?.temperature ?? null,
    maxTokens: session?.maxTokens ?? null,
    topP: session?.topP ?? null,
    frequencyPenalty: session?.frequencyPenalty ?? null,
    presencePenalty: session?.presencePenalty ?? null,
  };
}

export function SessionConfigPanel({ open, session, focus, onClose, onSave }: SessionConfigPanelProps) {
  const [values, setValues] = useState<SessionConfigValues>(() => toValues(session));

  useEffect(() => {
    if (open) setValues(toValues(session));
  }, [open, session]);

  if (!open) return null;

  function update<K extends keyof SessionConfigValues>(key: K, value: SessionConfigValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setValues({
      systemPrompt: "",
      temperature: null,
      maxTokens: null,
      topP: null,
      frequencyPenalty: null,
      presencePenalty: null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-96 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold">会话设置</div>
          <div className="flex items-center gap-2">
            <button
              className="text-xs text-gray-500 hover:text-blue-500 flex items-center gap-1"
              onClick={reset}
              title="重置为默认"
            >
              <RotateCcw size={12} /> 重置
            </button>
            <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700">System Prompt</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none"
              rows={6}
              placeholder="例：你是一个简洁的技术助手，用中文回答..."
              value={values.systemPrompt}
              onChange={(e) => update("systemPrompt", e.target.value)}
              autoFocus={focus === "system"}
            />
            <div className="text-[11px] text-gray-400">留空则不发送 system 消息</div>
          </div>

          <SliderRow
            label="Temperature"
            hint="0 更确定 / 2 更随机"
            min={0}
            max={2}
            step={0.1}
            defaultHint="未设置（使用服务端默认）"
            value={values.temperature}
            onChange={(v) => update("temperature", v)}
          />

          <NumberRow
            label="Max tokens"
            hint="输出长度上限"
            min={1}
            max={128000}
            step={1}
            value={values.maxTokens}
            onChange={(v) => update("maxTokens", v)}
          />

          <SliderRow
            label="Top P"
            hint="核采样：0-1"
            min={0}
            max={1}
            step={0.05}
            defaultHint="未设置（使用服务端默认）"
            value={values.topP}
            onChange={(v) => update("topP", v)}
          />

          <SliderRow
            label="Frequency penalty"
            hint="-2 到 2，越高越避免重复词"
            min={-2}
            max={2}
            step={0.1}
            defaultHint="未设置"
            value={values.frequencyPenalty}
            onChange={(v) => update("frequencyPenalty", v)}
          />

          <SliderRow
            label="Presence penalty"
            hint="-2 到 2，越高越倾向新主题"
            min={-2}
            max={2}
            step={0.1}
            defaultHint="未设置"
            value={values.presencePenalty}
            onChange={(v) => update("presencePenalty", v)}
          />
        </div>

        <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
          <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onClose}>
            取消
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
            onClick={() => onSave(values)}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  defaultHint: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

function SliderRow({ label, hint, min, max, step, defaultHint, value, onChange }: SliderRowProps) {
  const enabled = value !== null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-700">{label}</label>
        <label className="text-[11px] text-gray-500 flex items-center gap-1">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(e.target.checked ? (min + max) / 2 : null)}
          />
          启用
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="flex-1"
          min={min}
          max={max}
          step={step}
          value={enabled ? value : (min + max) / 2}
          disabled={!enabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="text-xs text-gray-600 w-10 text-right">
          {enabled ? value!.toFixed(2) : "—"}
        </span>
      </div>
      <div className="text-[11px] text-gray-400">{enabled ? hint : defaultHint}</div>
    </div>
  );
}

interface NumberRowProps {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
  onChange: (value: number | null) => void;
}

function NumberRow({ label, hint, min, max, step, value, onChange }: NumberRowProps) {
  const enabled = value !== null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-700">{label}</label>
        <label className="text-[11px] text-gray-500 flex items-center gap-1">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(e.target.checked ? 2048 : null)}
          />
          启用
        </label>
      </div>
      <input
        type="number"
        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50"
        min={min}
        max={max}
        step={step}
        value={enabled ? value! : ""}
        placeholder="服务端默认"
        disabled={!enabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isNaN(n) ? null : n);
        }}
      />
      <div className="text-[11px] text-gray-400">{hint}</div>
    </div>
  );
}
