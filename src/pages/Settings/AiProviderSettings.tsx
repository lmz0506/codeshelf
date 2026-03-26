import { useMemo, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Plus, X, Pencil, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { showToast } from "@/components/ui";
import { migrateChatHistoryDir } from "@/services/chat";
import type { AiProviderConfig, AiModelConfig } from "@/types";

interface AiProviderSettingsProps {
  onClose?: () => void;
}

type ProviderForm = Omit<AiProviderConfig, "id" | "models"> & { models: AiModelConfig[]; id?: string };

type HistoryState = {
  value: string;
  saving: boolean;
  error: string | null;
};


const PRESET_LABELS: Record<NonNullable<AiProviderConfig["presetKey"]>, string> = {
  bailian: "百炼 / 通义千问",
  deepseek: "DeepSeek",
  openai: "OpenAI",
  ollama: "Ollama",
  moonshot: "Moonshot AI",
};

const PRESET_BASE_URL: Record<NonNullable<AiProviderConfig["presetKey"]>, string> = {
  bailian: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434/v1",
  moonshot: "https://api.moonshot.cn/v1",
};

const PRESET_MODELS: Record<NonNullable<AiProviderConfig["presetKey"]>, Array<Pick<AiModelConfig, "model" | "thinking">>> = {
  bailian: [
    { model: "qwen-plus", thinking: false },
    { model: "qwen-turbo", thinking: false },
  ],
  deepseek: [
    { model: "deepseek-chat", thinking: false },
    { model: "deepseek-reasoner", thinking: true },
  ],
  openai: [
    { model: "gpt-4o", thinking: false },
    { model: "gpt-4.1", thinking: false },
  ],
  ollama: [
    { model: "llama3.1", thinking: false },
  ],
  moonshot: [
    { model: "moonshot-v1-8k", thinking: false },
  ],
};

function normalizeDefaultModel(models: AiModelConfig[]): AiModelConfig[] {
  if (models.length === 0) return models;
  const enabledModels = models.filter((m) => m.enabled);
  const hasDefault = enabledModels.some((m) => m.isDefault);
  if (hasDefault) return models;
  const firstEnabled = enabledModels[0] ?? models[0];
  return models.map((m) => ({ ...m, isDefault: m.id === firstEnabled.id }));
}

function createModelTemplate(name: string, thinking = false): AiModelConfig {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    model: name,
    enabled: true,
    isDefault: false,
    thinking,
  };
}

function createProviderTemplate(form: ProviderForm): AiProviderConfig {
  return {
    id: form.id ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name: form.name,
    providerType: form.providerType,
    presetKey: form.presetKey,
    baseUrl: form.baseUrl,
    apiKey: form.apiKey || undefined,
    enabled: form.enabled,
    isDefaultProvider: form.isDefaultProvider,
    models: form.models,
  };
}

const initialForm = (): ProviderForm => ({
  name: "",
  providerType: "preset",
  presetKey: "openai",
  baseUrl: PRESET_BASE_URL.openai,
  apiKey: "",
  enabled: false,
  isDefaultProvider: false,
  models: PRESET_MODELS.openai.map((m, index) => ({
    ...createModelTemplate(m.model, m.thinking),
    isDefault: index === 0,
  })),
});

function getHistoryState(dir?: string): HistoryState {
  return {
    value: dir ?? "",
    saving: false,
    error: null,
  };
}

function ProviderFormDrawer({
  open,
  title,
  form,
  editingId,
  onClose,
  onSubmit,
  onProviderTypeChange,
  onPresetChange,
  onFormChange,
  onModelChange,
  onAddModel,
  onRemoveModel,
  onSetDefaultModel,
}: {
  open: boolean;
  title: string;
  form: ProviderForm;
  editingId: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onProviderTypeChange: (type: "preset" | "custom") => void;
  onPresetChange: (key: NonNullable<AiProviderConfig["presetKey"]>) => void;
  onFormChange: (updates: Partial<ProviderForm>) => void;
  onModelChange: (id: string, updates: Partial<AiModelConfig>) => void;
  onAddModel: () => void;
  onRemoveModel: (id: string) => void;
  onSetDefaultModel: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-[520px] max-w-full bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            <div className="text-xs text-gray-500 mt-0.5">填写供应商信息与模型列表</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">供应商类型</label>
              <select
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                value={form.providerType}
                onChange={(e) => onProviderTypeChange(e.target.value as "preset" | "custom")}
              >
                <option value="preset">内置厂商</option>
                <option value="custom">自定义厂商</option>
              </select>
            </div>
            {form.providerType === "preset" && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500">内置厂商</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  value={form.presetKey ?? "openai"}
                  onChange={(e) => onPresetChange(e.target.value as NonNullable<AiProviderConfig["presetKey"]>)}
                >
                  {Object.entries(PRESET_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">供应商名称</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                value={form.name}
                onChange={(e) => onFormChange({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Base URL</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                value={form.baseUrl}
                onChange={(e) => onFormChange({ baseUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">API Key</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                type="password"
                placeholder={editingId ? "留空表示不修改" : "请输入 API Key"}
                value={form.apiKey}
                onChange={(e) => onFormChange({ apiKey: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500">启用</label>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => onFormChange({ enabled: e.target.checked })}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500">设为默认供应商</label>
              <input
                type="checkbox"
                checked={form.isDefaultProvider}
                onChange={(e) => onFormChange({ isDefaultProvider: e.target.checked })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-semibold">模型列表</h5>
              <button
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                onClick={onAddModel}
              >
                <Plus size={14} />
                添加模型
              </button>
            </div>

            <div className="space-y-2">
              {form.models.map((model) => (
                <div key={model.id} className="flex flex-col gap-3 p-3 border border-gray-200 rounded-lg">
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                    placeholder="模型名称"
                    value={model.model}
                    onChange={(e) => onModelChange(model.id, { model: e.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={model.enabled}
                        onChange={(e) => onModelChange(model.id, { enabled: e.target.checked })}
                      />
                      启用
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={model.isDefault}
                        onChange={() => onSetDefaultModel(model.id)}
                      />
                      默认
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={model.thinking}
                        onChange={(e) => onModelChange(model.id, { thinking: e.target.checked })}
                      />
                      thinking
                    </label>
                    <button
                      className="text-xs text-red-500 hover:text-red-600"
                      onClick={() => onRemoveModel(model.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryDirModal({
  open,
  state,
  onClose,
  onChange,
  onPick,
  onSave,
}: {
  open: boolean;
  state: HistoryState;
  onClose: () => void;
  onChange: (value: string) => void;
  onPick: () => void;
  onSave: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content w-[520px]" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>会话历史存储路径</h3>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body space-y-3">
          <p className="text-xs text-gray-500">
            默认使用安装目录下 data/conversations，修改后会迁移历史到新目录（目标需为空）
          </p>
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            value={state.value}
            placeholder="例如：D:/codeshelf/data/conversations"
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg flex items-center gap-1"
              onClick={onPick}
            >
              <FolderOpen size={14} />
              选择目录
            </button>
            <button
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg disabled:opacity-60"
              onClick={onSave}
              disabled={state.saving}
            >
              {state.saving ? "迁移中..." : "保存并迁移"}
            </button>
          </div>
          {state.error && (
            <div className="text-xs text-red-500">{state.error}</div>
          )}
        </div>
      </div>
    </div>
  );
}


export type AiProviderSettingsHandle = {
  openCreateDrawer: () => void;
  openHistoryModal: () => void;
};

export const AiProviderSettings = forwardRef<AiProviderSettingsHandle, AiProviderSettingsProps>(({ onClose }, ref) => {
  const { aiProviders, saveAiProviders, chatHistoryDir, setChatHistoryDir } = useAppStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryState>(getHistoryState(chatHistoryDir));
  const [form, setForm] = useState<ProviderForm>(initialForm());

  const providers = aiProviders;

  const defaultProviderId = useMemo(
    () => providers.find((p) => p.isDefaultProvider)?.id ?? null,
    [providers]
  );

  useEffect(() => {
    setHistoryState((prev) => ({ ...prev, value: chatHistoryDir ?? "" }));
  }, [chatHistoryDir]);

  useImperativeHandle(ref, () => ({
    openCreateDrawer: openCreate,
    openHistoryModal: () => setHistoryModalOpen(true),
  }));

  async function handlePickHistoryDir() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择会话历史目录" });
      if (selected) {
        setHistoryState((prev) => ({ ...prev, value: selected as string, error: null }));
      }
    } catch {
      setHistoryState((prev) => ({ ...prev, error: "选择目录失败" }));
    }
  }

  async function handleSaveHistoryDir() {
    if (historyState.saving) return;
    setHistoryState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const newDir = historyState.value.trim();
      if (!newDir) {
        setHistoryState((prev) => ({ ...prev, saving: false, error: "请填写有效路径" }));
        return;
      }
      await migrateChatHistoryDir(newDir);
      setChatHistoryDir(newDir);
      showToast("success", "会话历史目录已更新");
      setHistoryModalOpen(false);
    } catch (err) {
      setHistoryState((prev) => ({ ...prev, error: err instanceof Error ? err.message : "迁移失败" }));
    } finally {
      setHistoryState((prev) => ({ ...prev, saving: false }));
    }
  }

  function resetForm() {
    setEditingId(null);
    setEditorOpen(false);
    setForm(initialForm());
  }

  function openCreate() {
    setEditingId(null);
    setForm(initialForm());
    setEditorOpen(true);
  }

  function handleProviderTypeChange(type: "preset" | "custom") {
    if (type === "custom") {
      setForm((prev) => ({
        ...prev,
        providerType: "custom",
        presetKey: undefined,
        name: prev.name || "自定义厂商",
        baseUrl: prev.baseUrl || "",
      }));
    } else {
      const presetKey = (form.presetKey ?? "openai") as NonNullable<AiProviderConfig["presetKey"]>;
      setForm((prev) => ({
        ...prev,
        providerType: "preset",
        presetKey,
        name: PRESET_LABELS[presetKey],
        baseUrl: PRESET_BASE_URL[presetKey],
        models: PRESET_MODELS[presetKey].map((m, index) => ({
          ...createModelTemplate(m.model, m.thinking),
          isDefault: index === 0,
        })),
      }));
    }
  }

  function handlePresetChange(presetKey: NonNullable<AiProviderConfig["presetKey"]>) {
    setForm((prev) => ({
      ...prev,
      presetKey,
      name: PRESET_LABELS[presetKey],
      baseUrl: PRESET_BASE_URL[presetKey],
      models: PRESET_MODELS[presetKey].map((m, index) => ({
        ...createModelTemplate(m.model, m.thinking),
        isDefault: index === 0,
      })),
    }));
  }

  function openEdit(provider: AiProviderConfig) {
    setEditingId(provider.id);
    setEditorOpen(true);
    setForm({
      id: provider.id,
      name: provider.name,
      providerType: provider.providerType,
      presetKey: provider.presetKey,
      baseUrl: provider.baseUrl,
      apiKey: "",
      enabled: provider.enabled,
      isDefaultProvider: provider.isDefaultProvider,
      models: normalizeDefaultModel(provider.models),
    });
  }

  function handleSaveProvider() {
    if (!form.name.trim()) {
      showToast("warning", "请输入供应商名称");
      return;
    }
    if (!form.baseUrl.trim()) {
      showToast("warning", "请输入 Base URL");
      return;
    }
    if (form.models.length === 0) {
      showToast("warning", "请至少添加一个模型");
      return;
    }
    if (!form.models.some((m) => m.model.trim())) {
      showToast("warning", "模型名称不能为空");
      return;
    }

    let apiKey = form.apiKey.trim();
    if (editingId && apiKey === "") {
      apiKey = providers.find((p) => p.id === editingId)?.apiKey ?? "";
    }

    const normalizedModels = normalizeDefaultModel(
      form.models.map((m) => ({ ...m, model: m.model.trim() }))
    );
    const provider = createProviderTemplate({ ...form, apiKey, models: normalizedModels });

    let nextProviders: AiProviderConfig[];
    if (editingId) {
      nextProviders = providers.map((p) => (p.id === editingId ? provider : p));
    } else {
      nextProviders = [...providers, provider];
    }

    if (provider.isDefaultProvider) {
      nextProviders = nextProviders.map((p) => ({
        ...p,
        isDefaultProvider: p.id === provider.id,
      }));
    }

    saveAiProviders(nextProviders);
    showToast("success", "保存成功");
    resetForm();
  }

  function handleRemoveProvider(id: string) {
    const nextProviders = providers.filter((p) => p.id !== id);
    saveAiProviders(nextProviders);
    showToast("success", "已删除供应商");
  }

  function handleToggleProvider(id: string) {
    const nextProviders = providers.map((p) =>
      p.id === id ? { ...p, enabled: !p.enabled } : p
    );
    saveAiProviders(nextProviders);
  }

  function handleSetDefaultProvider(id: string) {
    const nextProviders = providers.map((p) => ({
      ...p,
      isDefaultProvider: p.id === id,
    }));
    saveAiProviders(nextProviders);
  }

  function updateModel(id: string, updates: Partial<AiModelConfig>) {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
  }

  function addModel() {
    setForm((prev) => ({
      ...prev,
      models: [...prev.models, createModelTemplate("", false)],
    }));
  }

  function removeModel(id: string) {
    setForm((prev) => ({
      ...prev,
      models: prev.models.filter((m) => m.id !== id),
    }));
  }

  function setDefaultModel(id: string) {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((m) => ({ ...m, isDefault: m.id === id })),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="re-shelf">
        {providers.length === 0 && (
          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
            暂无供应商配置，请新增一个供应商。
          </div>
        )}

        {providers.map((provider) => (
          <div key={provider.id} className="re-card cursor-default">
            <div className="re-card-header">
              <h4>{provider.name}</h4>
              <div className="flex items-center gap-2">
                {provider.isDefaultProvider && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-400 bg-blue-50 text-blue-700">默认</span>
                )}
                {provider.enabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400 bg-emerald-50 text-emerald-700">已启用</span>
                )}
                {!provider.enabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50 text-gray-500">未启用</span>
                )}
                <button
                  className="text-xs text-gray-500 hover:text-blue-600"
                  onClick={() => openEdit(provider)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="text-xs text-gray-500 hover:text-red-500"
                  onClick={() => handleRemoveProvider(provider.id)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="re-card-meta">{provider.baseUrl}</div>

            <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
              <span>模型数：{provider.models.length}</span>
              <span>API Key：{provider.apiKey ? "已配置" : "未配置"}</span>
            </div>

            <div className="space-y-1 mb-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>默认模型：</span>
                <span>{provider.models.find((m) => m.isDefault)?.model || "未设置"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {provider.models.map((model) => (
                  <span
                    key={model.id}
                    className={"px-2 py-0.5 rounded-full text-[10px] " + (model.enabled ? "bg-gray-100 text-gray-700" : "bg-gray-50 text-gray-400")}
                  >
                    {model.model}{model.isDefault ? "（默认）" : ""}{model.thinking ? " / thinking" : ""}
                  </span>
                ))}
              </div>
            </div>

            <div className="re-card-footer">
              <span className={"re-status " + (provider.enabled ? "" : "bg-gray-100 text-gray-500 border border-gray-200")}
              >
                {provider.enabled ? "已启用" : "未启用"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className={"px-2 py-1 rounded border text-xs " + (provider.enabled ? "border-green-300 text-green-600" : "border-gray-200")}
                  onClick={() => handleToggleProvider(provider.id)}
                >
                  {provider.enabled ? "停用" : "启用"}
                </button>
                <button
                  className={"px-2 py-1 rounded border text-xs " + (provider.isDefaultProvider ? "border-blue-400 text-blue-600" : "border-gray-200")}
                  onClick={() => handleSetDefaultProvider(provider.id)}
                  disabled={!provider.enabled}
                >
                  设为默认
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {defaultProviderId === null && providers.length > 0 && (
        <div className="p-3 bg-amber-50 text-xs text-amber-700 rounded-lg">
          当前尚未设置默认供应商，启用供应商后会自动设为默认。
        </div>
      )}

      <ProviderFormDrawer
        open={editorOpen}
        title={editingId ? "编辑供应商" : "新增供应商"}
        form={form}
        editingId={editingId}
        onClose={resetForm}
        onSubmit={handleSaveProvider}
        onProviderTypeChange={handleProviderTypeChange}
        onPresetChange={handlePresetChange}
        onFormChange={(updates) => setForm((prev) => ({ ...prev, ...updates }))}
        onModelChange={updateModel}
        onAddModel={addModel}
        onRemoveModel={removeModel}
        onSetDefaultModel={setDefaultModel}
      />

      <HistoryDirModal
        open={historyModalOpen}
        state={historyState}
        onClose={() => setHistoryModalOpen(false)}
        onChange={(value) => setHistoryState((prev) => ({ ...prev, value }))}
        onPick={handlePickHistoryDir}
        onSave={handleSaveHistoryDir}
      />
    </div>
  );
});
