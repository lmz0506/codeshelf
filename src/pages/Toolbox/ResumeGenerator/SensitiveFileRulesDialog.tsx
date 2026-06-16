import { useEffect, useMemo, useState } from "react";
import { FileWarning, RotateCcw, Save, ShieldAlert } from "lucide-react";
import { Dialog } from "@/components/common";
import { Button, showToast } from "@/components/ui";
import { useSettingsStore } from "@/stores/settingsStore";
import defaultSensitiveFilePatterns from "@/config/defaultSensitiveFilePatterns.json";

interface SensitiveFileRulesDialogProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_PATTERNS = defaultSensitiveFilePatterns;

function normalizeRules(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countEffectiveRules(rules: string[]): number {
  return rules.filter((line) => !line.startsWith("#")).length;
}

function countAllowRules(rules: string[]): number {
  return rules.filter((line) => line.startsWith("!")).length;
}

export function SensitiveFileRulesDialog({
  open,
  onClose,
}: SensitiveFileRulesDialogProps) {
  const sensitiveFilePatterns = useSettingsStore((s) => s.sensitiveFilePatterns);
  const setSensitiveFilePatterns = useSettingsStore((s) => s.setSensitiveFilePatterns);
  const [draft, setDraft] = useState(() => sensitiveFilePatterns.join("\n"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(sensitiveFilePatterns.join("\n"));
    }
  }, [open, sensitiveFilePatterns]);

  const draftRules = useMemo(() => normalizeRules(draft), [draft]);
  const dirty = useMemo(
    () => draftRules.join("\n") !== sensitiveFilePatterns.join("\n"),
    [draftRules, sensitiveFilePatterns]
  );
  const effectiveCount = countEffectiveRules(draftRules);
  const allowCount = countAllowRules(draftRules);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSensitiveFilePatterns(draftRules);
      showToast("success", "敏感文件规则已保存");
      onClose();
    } catch (err) {
      showToast("error", "保存失败", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="敏感文件规则"
      icon={ShieldAlert}
      iconBg="bg-red-100"
      iconColor="text-red-500"
      size="lg"
      footer={
        <>
          <Button onClick={onClose} variant="secondary" disabled={saving}>
            关闭
          </Button>
          <Button
            onClick={() => setDraft(DEFAULT_PATTERNS.join("\n"))}
            variant="secondary"
            className="gap-1"
            disabled={saving}
          >
            <RotateCcw size={14} />
            恢复默认
          </Button>
          <Button
            onClick={handleSave}
            variant="primary"
            className="gap-1"
            disabled={saving || !dirty}
          >
            <Save size={14} />
            {saving ? "保存中..." : "保存规则"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="有效规则" value={effectiveCount} />
          <Metric label="放行规则" value={allowCount} />
          <Metric label="默认规则" value={DEFAULT_PATTERNS.length} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">规则列表</label>
            <span className="text-[11px] text-gray-400">语法与 .gitignore 一致</span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-full min-h-[320px] resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs leading-5 text-gray-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            placeholder={".env\n*.pem\nsecrets/\n!examples/.env.sample"}
          />
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <FileWarning size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <div className="text-xs leading-5 text-amber-800">
              这些规则会在生成项目背景知识时拦截项目索引、文件读取和搜索。已保存的历史背景知识不会被重写。
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}
