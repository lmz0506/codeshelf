import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Settings } from "lucide-react";

import { Dialog } from "@/components/common";
import { Button, showToast } from "@/components/ui";
import {
  getResumeKnowledgePromptConfig,
  resetResumeKnowledgePromptConfig,
  saveResumeKnowledgePromptConfig,
  type ResumeAgentPromptConfig,
} from "@/services/resume/knowledgeStore";

interface PromptConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

type PromptKey = "background" | "resume";

export function PromptConfigDialog({
  open,
  onClose,
  onSaved,
}: PromptConfigDialogProps) {
  const [config, setConfig] = useState<ResumeAgentPromptConfig | null>(null);
  const [activePrompt, setActivePrompt] = useState<PromptKey>("background");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void getResumeKnowledgePromptConfig()
      .then(setConfig)
      .catch((err) =>
        showToast("error", `读取提示词失败: ${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => setLoading(false));
  }, [open]);

  const promptItems = [
    {
      key: "background" as const,
      label: "背景知识提示词",
      description: "用于项目调查和 background.md 生成",
      value: config?.backgroundPrompt ?? "",
    },
    {
      key: "resume" as const,
      label: "简历生成提示词",
      description: "用于把背景知识转成简历内容",
      value: config?.resumePrompt ?? "",
    },
  ];
  const activeItem = promptItems.find((item) => item.key === activePrompt) ?? promptItems[0];

  const handlePromptChange = (value: string) => {
    if (!config) return;
    if (activePrompt === "background") {
      setConfig({ ...config, backgroundPrompt: value });
      return;
    }
    setConfig({ ...config, resumePrompt: value });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const next = await saveResumeKnowledgePromptConfig(config);
      setConfig(next);
      onSaved?.();
      showToast("success", "提示词已保存");
    } catch (err) {
      showToast("error", `保存失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const next = await resetResumeKnowledgePromptConfig();
      setConfig(next);
      onSaved?.();
      showToast("success", "已恢复默认提示词");
    } catch (err) {
      showToast("error", `恢复失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="提示词配置"
      icon={Settings}
      size="xl"
      footer={
        <>
          <Button onClick={onClose} variant="secondary" disabled={saving}>
            关闭
          </Button>
          <Button onClick={handleReset} variant="secondary" disabled={saving || loading} className="gap-1.5">
            <RefreshCw size={15} />
            默认
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !config} className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-500">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            保存
          </Button>
        </>
      }
    >
      {loading || !config ? (
        <div className="flex h-[560px] items-center justify-center text-sm text-gray-500">
          <Loader2 size={16} className="mr-2 animate-spin" />
          读取提示词中...
        </div>
      ) : (
        <div className="flex h-[620px] min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-emerald-900/5">
          <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
            <div className="space-y-2 border-r border-emerald-100 bg-emerald-50/40 p-3">
              {promptItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActivePrompt(item.key)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    activePrompt === item.key
                      ? "border-emerald-200 bg-white text-emerald-700 shadow-sm"
                      : "border-transparent text-gray-700 hover:border-emerald-100 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-[11px] text-gray-400">{[...item.value].length}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{item.description}</div>
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">{activeItem.label}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{activeItem.description}</div>
                </div>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">
                  {[...activeItem.value].length} 字符
                </span>
              </div>
              <textarea
                value={activeItem.value}
                onChange={(event) => handlePromptChange(event.target.value)}
                className="min-h-0 flex-1 resize-none border-0 bg-white p-4 font-mono text-xs leading-5 text-gray-800 outline-none focus:ring-0"
              />
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
