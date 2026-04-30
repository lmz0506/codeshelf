import { useMemo, useState } from "react";
import { KeyRound, Wand2 } from "lucide-react";
import { Button, showToast } from "@/components/ui";
import {
  evaluateKeyStrength,
  generateToken,
  keyStrengthLabel,
  newKeyId,
  resolveExpiry,
} from "./utils";
import type { ExpiryConfig, ExpiryMode, McpGatewayKey } from "./types";

interface Props {
  existingKeys: McpGatewayKey[];
  onAdd: (entry: McpGatewayKey) => Promise<void> | void;
}

const EXPIRY_OPTIONS: { value: ExpiryMode; label: string }[] = [
  { value: "never", label: "永久有效" },
  { value: "preset_1d", label: "1 天后过期" },
  { value: "preset_7d", label: "7 天后过期" },
  { value: "preset_30d", label: "30 天后过期" },
  { value: "preset_90d", label: "90 天后过期" },
  { value: "at", label: "指定过期时间…" },
];

/** 添加新密钥的表单（名称 / 密钥值 / 自动生成 / 过期）。 */
export function KeyAddForm({ existingKeys, onAdd }: Props) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [expiry, setExpiry] = useState<ExpiryConfig>({ mode: "never", customLocal: "" });

  const strength = useMemo(() => evaluateKeyStrength(value), [value]);
  const strengthInfo = keyStrengthLabel(strength);

  function reset() {
    setName("");
    setValue("");
    setExpiry({ mode: "never", customLocal: "" });
  }

  async function handleAdd() {
    const trimmedName = name.trim();
    const token = value.trim();

    if (!trimmedName) {
      showToast("warning", "请填写密钥名称");
      return;
    }
    if (!token) {
      showToast("warning", "请手动输入或自动生成密钥");
      return;
    }
    const { iso, ok } = resolveExpiry(expiry);
    if (!ok) {
      showToast("warning", "请选择有效的过期时间（必须晚于现在）");
      return;
    }
    if (existingKeys.some((item) => item.key === token)) {
      showToast("warning", "该密钥已存在");
      return;
    }
    if (existingKeys.some((item) => item.name === trimmedName)) {
      const proceed = confirm(`已经有同名密钥 "${trimmedName}"，仍要添加吗？`);
      if (!proceed) return;
    }
    if (strength === "weak") {
      const proceed = confirm("当前密钥比较弱（长度短或字符种类少），建议改用「生成」按钮自动生成。仍要添加吗？");
      if (!proceed) return;
    }

    const entry: McpGatewayKey = {
      id: newKeyId(),
      name: trimmedName,
      key: token,
      enabled: true,
      createdAt: new Date().toISOString(),
      expiresAt: iso,
    };
    reset();
    await onAdd(entry);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)_120px] gap-2 items-start">
        <input
          className="h-9 border border-gray-200 rounded px-2 text-sm"
          placeholder="客户端名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="h-9 min-w-0 border border-gray-200 rounded px-2 text-sm font-mono"
          placeholder="手动输入密钥，或点击自动生成"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => setValue(generateToken())}
          className="h-9 whitespace-nowrap"
          title="生成 256 位随机密钥"
        >
          <Wand2 size={15} className="mr-1" /> 生成
        </Button>
      </div>

      {strength !== "empty" && strengthInfo.text && (
        <div className={`text-[11px] ${strengthInfo.tone}`}>
          密钥强度：{strengthInfo.text}
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-2 items-start ${
          expiry.mode === "at"
            ? "md:grid-cols-[160px_minmax(0,1fr)_120px]"
            : "md:grid-cols-[160px_120px]"
        }`}
      >
        <select
          className="h-9 border border-gray-200 rounded px-2 text-sm"
          value={expiry.mode}
          onChange={(e) => setExpiry({ ...expiry, mode: e.target.value as ExpiryMode })}
        >
          {EXPIRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {expiry.mode === "at" && (
          <input
            className="h-9 min-w-0 border border-gray-200 rounded px-2 text-sm"
            type="datetime-local"
            value={expiry.customLocal}
            onChange={(e) => setExpiry({ ...expiry, customLocal: e.target.value })}
          />
        )}
        <Button onClick={handleAdd} className="h-9 whitespace-nowrap">
          <KeyRound size={15} className="mr-1" /> 添加
        </Button>
      </div>
    </div>
  );
}
