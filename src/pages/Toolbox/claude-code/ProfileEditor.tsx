// 配置档案编辑器组件 - 支持新建和编辑模式，左右分栏布局

import { useState, useMemo, useRef, useEffect } from "react";
import {
  X,
  Save,
  Sliders,
  Lock,
  ChevronDown,
  Search,
  Check,
  Copy,
  WrapText,
  AlertCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui";
import type { ConfigProfile } from "@/types/toolbox";
import {
  type QuickConfigOption,
  getCategoryIcon,
  getNestedValue,
  setNestedKey,
  deleteNestedKey,
} from "./constants";

// 推荐模板数据
const RECOMMENDED_TEMPLATE: Record<string, unknown> = {
  env: {
    ANTHROPIC_AUTH_TOKEN: "sa-token",
    ANTHROPIC_BASE_URL: "你的地址",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-opus-4-6[1m]",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-6[1m]",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-opus-4-6[1m]",
    ANTHROPIC_MODEL: "claude-opus-4-6[1m]",
    CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_AUTOUPDATER: "1",
    DISABLE_ERROR_REPORTING: "1",
    DISABLE_TELEMETRY: "1"
  },
  permissions: {
    defaultMode: "bypassPermissions"
  },
  model: "opus[1m]",
  effortLevel: "medium",
};

interface ProfileEditorBaseProps {
  quickConfigs: QuickConfigOption[];
  onClose: () => void;
}

interface ProfileEditorCreateProps extends ProfileEditorBaseProps {
  mode: "create";
  existingNames: string[];
  currentSettings: string;
  recommendedTemplate?: string;
  onSaveRecommendedTemplate?: (content: string) => Promise<void>;
  onResetRecommendedTemplate?: () => Promise<void>;
  onSave: (name: string, description: string | undefined, content: string) => Promise<void>;
}

interface ProfileEditorEditProps extends ProfileEditorBaseProps {
  mode: "edit";
  profile: ConfigProfile;
  isActive: boolean;
  onSave: (description: string | undefined, content: string) => Promise<void>;
}

type ProfileEditorProps = ProfileEditorCreateProps | ProfileEditorEditProps;

type InitialSource = "empty" | "current" | "quick" | "recommended";

function getInitialContent(
  mode: "create" | "edit",
  props: ProfileEditorProps,
): string {
  if (mode === "edit") {
    const p = props as ProfileEditorEditProps;
    const settings = { ...(p.profile.settings as Record<string, unknown>) };
    delete settings.__active;
    return JSON.stringify(settings, null, 2);
  }
  return "{}";
}

function getContentForSource(
  source: InitialSource,
  currentSettings: string,
  quickConfigs: QuickConfigOption[],
  recommendedTemplate?: string,
): string {
  switch (source) {
    case "empty":
      return "{}";
    case "current": {
      try {
        const parsed = JSON.parse(currentSettings);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return "{}";
      }
    }
    case "quick": {
      const settings: Record<string, unknown> = {};
      quickConfigs.forEach(opt => {
        if (opt.defaultValue !== "" && opt.defaultValue !== null && opt.defaultValue !== undefined) {
          settings[opt.configKey] = opt.defaultValue;
        }
      });
      return JSON.stringify(settings, null, 2);
    }
    case "recommended": {
      if (recommendedTemplate) {
        try {
          const parsed = JSON.parse(recommendedTemplate);
          return JSON.stringify(parsed, null, 2);
        } catch {
          // fallback to built-in
        }
      }
      return JSON.stringify(RECOMMENDED_TEMPLATE, null, 2);
    }
  }
}

export function ProfileEditor(props: ProfileEditorProps) {
  const { mode, quickConfigs, onClose } = props;

  // 新建模式专用 state
  const [profileName, setProfileName] = useState("");
  const [profileNameError, setProfileNameError] = useState<string | null>(null);
  const [initialSource, setInitialSource] = useState<InitialSource>("empty");

  // 描述 - 新建和编辑都支持
  const [description, setDescription] = useState(
    mode === "edit" ? (props as ProfileEditorEditProps).profile.description || "" : ""
  );

  // 编辑内容
  const [editingContent, setEditingContent] = useState(() => getInitialContent(mode, props));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // JSON 格式验证
  const jsonError = useMemo(() => {
    const text = editingContent.trim();
    if (!text) return null;
    try {
      JSON.parse(text);
      return null;
    } catch (e) {
      return e instanceof SyntaxError ? e.message : "无效的 JSON 格式";
    }
  }, [editingContent]);

  // 自定义下拉框状态（编辑模式用）
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉框
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 初始配置源切换时更新 JSON 内容（新建模式）
  useEffect(() => {
    if (mode === "create") {
      const p = props as ProfileEditorCreateProps;
      setEditingContent(getContentForSource(initialSource, p.currentSettings, quickConfigs, p.recommendedTemplate));
    }
  }, [initialSource]);

  // 解析当前配置值
  const editingValues = useMemo(() => {
    try {
      const config = JSON.parse(editingContent);
      const values: Record<string, unknown> = {};
      quickConfigs.forEach(opt => {
        const keys = opt.configKey.split(".");
        const value = getNestedValue(config, keys);
        values[opt.id] = value !== undefined ? value : opt.defaultValue;
      });
      return values;
    } catch {
      return {};
    }
  }, [editingContent, quickConfigs]);

  // 按分类分组
  const groupedOptions = useMemo(() => {
    return quickConfigs.reduce((acc, opt) => {
      if (!acc[opt.category]) {
        acc[opt.category] = [];
      }
      acc[opt.category].push(opt);
      return acc;
    }, {} as Record<string, QuickConfigOption[]>);
  }, [quickConfigs]);

  function applyQuickConfig(optionId: string, value: unknown) {
    const opt = quickConfigs.find(o => o.id === optionId);
    if (!opt) return;

    try {
      let config: Record<string, unknown> = {};
      if (editingContent.trim()) {
        config = JSON.parse(editingContent);
      }

      const keys = opt.configKey.split(".");

      if (value === "" || value === undefined || value === null) {
        deleteNestedKey(config, keys);
      } else {
        setNestedKey(config, keys, value);
      }

      setEditingContent(JSON.stringify(config, null, 2));
    } catch {
      // JSON 解析失败
    }
  }

  async function handleSave() {
    if (jsonError) return;

    if (mode === "create") {
      const p = props as ProfileEditorCreateProps;
      const trimmedName = profileName.trim();
      if (!trimmedName) return;

      if (p.existingNames.includes(trimmedName)) {
        setProfileNameError("配置档案名称已存在，请使用其他名称");
        return;
      }
      setProfileNameError(null);
      setSaving(true);
      try {
        await p.onSave(trimmedName, description.trim() || undefined, editingContent);
      } finally {
        setSaving(false);
      }
    } else {
      const p = props as ProfileEditorEditProps;
      setSaving(true);
      try {
        await p.onSave(description.trim() || undefined, editingContent);
      } finally {
        setSaving(false);
      }
    }
  }

  function handleFormat() {
    try {
      const parsed = JSON.parse(editingContent);
      setEditingContent(JSON.stringify(parsed, null, 2));
    } catch {
      // JSON 无效时不做格式化
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(editingContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function renderConfigEditor(opt: QuickConfigOption) {
    const value = editingValues[opt.id];

    switch (opt.valueType) {
      case "boolean":
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => applyQuickConfig(opt.id, "")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                value === "" || value === undefined
                  ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
              }`}
            >
              未设置
            </button>
            <button
              onClick={() => applyQuickConfig(opt.id, true)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                value === true
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
              }`}
            >
              开启
            </button>
            <button
              onClick={() => applyQuickConfig(opt.id, false)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                value === false
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
              }`}
            >
              关闭
            </button>
          </div>
        );

      case "select":
        return (
          <select
            value={String(value ?? "")}
            onChange={(e) => applyQuickConfig(opt.id, e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {opt.allowEmpty && <option value="">未设置</option>}
            {opt.options?.map(option => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "model": {
        const isCustom = Boolean(value) && !opt.options?.some(o => o.value === value);
        return (
          <div className="flex flex-col gap-1 w-full">
            <select
              value={isCustom ? "__custom__" : String(value ?? "")}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  if (!isCustom) applyQuickConfig(opt.id, "");
                } else {
                  applyQuickConfig(opt.id, e.target.value);
                }
              }}
              className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">未设置</option>
              {opt.options?.map(option => (
                <option key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
              <option value="__custom__">自定义...</option>
            </select>
            {isCustom && (
              <input
                type="text"
                value={String(value || "")}
                onChange={(e) => applyQuickConfig(opt.id, e.target.value)}
                placeholder="输入模型名称，如: claude-opus-4-5-20251101"
                className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>
        );
      }

      case "string":
      case "number":
        return (
          <input
            type={opt.valueType === "number" ? "number" : "text"}
            value={String(value || "")}
            onChange={(e) => applyQuickConfig(opt.id, opt.valueType === "number" ? Number(e.target.value) : e.target.value)}
            placeholder={opt.placeholder}
            className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );

      default:
        return null;
    }
  }

  const selectedOpt = selectedConfigId ? quickConfigs.find(c => c.id === selectedConfigId) : null;
  const SelectedCategoryIcon = selectedOpt ? getCategoryIcon(selectedOpt.category) : null;

  // 统计已配置项数量
  const configuredCount = Object.entries(editingValues).filter(([, v]) => v !== "" && v !== undefined && v !== null).length;

  const isCreateMode = mode === "create";
  const canSave = isCreateMode ? !!profileName.trim() && !jsonError : !jsonError;

  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[85vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isCreateMode ? "新建配置档案" : "编辑配置档案"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区 - 左右分栏 */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* 左侧面板 */}
          <div className="w-[360px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 space-y-4">
            {isCreateMode ? (
              /* 新建模式左侧 */
              <>
                {/* 名称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">档案名称 *</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => {
                      setProfileName(e.target.value);
                      setProfileNameError(null);
                    }}
                    placeholder="如: 开发环境"
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      profileNameError ? "border-red-500" : "border-gray-200 dark:border-gray-700"
                    }`}
                  />
                  {profileNameError && (
                    <p className="text-xs text-red-500 mt-1">{profileNameError}</p>
                  )}
                </div>

                {/* 描述 */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">描述</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="可选"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 初始配置源 */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">初始配置</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input
                        type="radio"
                        checked={initialSource === "empty"}
                        onChange={() => setInitialSource("empty")}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div>
                        <div className="font-medium text-sm">空白配置</div>
                        <div className="text-xs text-gray-500">从头开始</div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input
                        type="radio"
                        checked={initialSource === "current"}
                        onChange={() => setInitialSource("current")}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div>
                        <div className="font-medium text-sm">复制当前配置</div>
                        <div className="text-xs text-gray-500">从 settings.json 复制</div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input
                        type="radio"
                        checked={initialSource === "quick"}
                        onChange={() => setInitialSource("quick")}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div>
                        <div className="font-medium text-sm">使用快捷配置默认值</div>
                        <div className="text-xs text-gray-500">应用快捷配置中设置的默认值</div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-2.5 border border-blue-200 dark:border-blue-700 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <input
                        type="radio"
                        checked={initialSource === "recommended"}
                        onChange={() => setInitialSource("recommended")}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div>
                        <div className="font-medium text-sm">推荐模板（第三方 API）</div>
                        <div className="text-xs text-gray-500">包含第三方 API 代理的推荐配置，创建后请修改地址和令牌</div>
                      </div>
                    </label>
                  </div>
                  {/* 推荐模板操作区 */}
                  {initialSource === "recommended" && (
                    <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span>当前模板:</span>
                        {(props as ProfileEditorCreateProps).recommendedTemplate ? (
                          <span className="text-yellow-600 dark:text-yellow-400 font-medium">(自定义)</span>
                        ) : (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">(默认)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (!jsonError) {
                              (props as ProfileEditorCreateProps).onSaveRecommendedTemplate?.(editingContent);
                            }
                          }}
                          disabled={!!jsonError}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800/30 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="将当前 JSON 编辑区内容保存为自定义推荐模板"
                        >
                          <Save size={12} />
                          <span>保存为自定义模板</span>
                        </button>
                        <button
                          onClick={() => {
                            (props as ProfileEditorCreateProps).onResetRecommendedTemplate?.();
                            setEditingContent(getContentForSource("recommended", (props as ProfileEditorCreateProps).currentSettings, quickConfigs, undefined));
                          }}
                          disabled={!(props as ProfileEditorCreateProps).recommendedTemplate}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="恢复为内置默认推荐模板"
                        >
                          <RotateCcw size={12} />
                          <span>恢复默认</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* 编辑模式左侧 */
              <>
                {/* 名称（只读） */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">档案名称</label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                      {(props as ProfileEditorEditProps).profile.name}
                    </span>
                    <span title="编辑时不可修改名称">
                      <Lock size={14} className="text-gray-400" />
                    </span>
                    {(props as ProfileEditorEditProps).isActive && (
                      <span className="text-[10px] text-green-600 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">
                        已启用
                      </span>
                    )}
                  </div>
                </div>

                {/* 描述（可编辑） */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">描述</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="可选"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 快捷配置 */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Sliders size={14} />
                    快捷配置
                  </h4>

                  {/* 自定义下拉选择器 */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <span className={selectedConfigId ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                        {selectedConfigId
                          ? quickConfigs.find(c => c.id === selectedConfigId)?.name || "选择要配置的项..."
                          : "选择要配置的项..."}
                      </span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {/* 下拉菜单 */}
                    {dropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-[300px] overflow-hidden flex flex-col">
                        {/* 搜索框 */}
                        <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                          <div className="relative">
                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              placeholder="搜索配置项..."
                              className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus
                            />
                          </div>
                        </div>

                        {/* 选项列表 */}
                        <div className="flex-1 overflow-y-auto">
                          {Object.entries(groupedOptions).map(([category, options]) => {
                            const filteredOptions = options.filter(opt =>
                              !searchTerm || opt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              opt.description.toLowerCase().includes(searchTerm.toLowerCase())
                            );
                            if (filteredOptions.length === 0) return null;

                            const CatIcon = getCategoryIcon(category);
                            return (
                              <div key={category}>
                                <div className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 dark:bg-gray-900 flex items-center gap-1.5 sticky top-0">
                                  <CatIcon size={12} />
                                  {category}
                                </div>
                                {filteredOptions.map((opt) => {
                                  const val = editingValues[opt.id];
                                  const hasValue = val !== "" && val !== undefined && val !== null;
                                  const isSelected = selectedConfigId === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedConfigId(opt.id);
                                        setDropdownOpen(false);
                                        setSearchTerm("");
                                      }}
                                      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                        isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                                      }`}
                                    >
                                      <span className="truncate">{opt.name}</span>
                                      {hasValue && <Check size={14} className="text-green-500 flex-shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 选中的配置项编辑 */}
                  {selectedOpt && SelectedCategoryIcon && (
                    <div className="p-4 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                          <SelectedCategoryIcon size={16} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-white">{selectedOpt.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{selectedOpt.description}</div>
                          <code className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 rounded mt-1 inline-block">
                            {selectedOpt.configKey}
                          </code>
                        </div>
                      </div>
                      <div>{renderConfigEditor(selectedOpt)}</div>
                    </div>
                  )}

                  {/* 已配置项统计 */}
                  <div className="text-xs text-gray-500">
                    已配置: {configuredCount} 项
                    {configuredCount > 0 && (
                      <span className="ml-2">
                        ({Object.entries(editingValues)
                          .filter(([, v]) => v !== "" && v !== undefined && v !== null)
                          .map(([id]) => quickConfigs.find(c => c.id === id)?.name)
                          .filter(Boolean)
                          .slice(0, 3)
                          .join(", ") as string}
                        {configuredCount > 3 ? "..." : ""})
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 右侧面板 - JSON 编辑器 */}
          <div className="flex-1 flex flex-col min-h-0 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                JSON 配置
                {jsonError && (
                  <span className="flex items-center gap-1 text-xs font-normal text-red-500">
                    <AlertCircle size={12} />
                    格式错误
                  </span>
                )}
              </h4>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleFormat}
                  disabled={!!jsonError}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="格式化 JSON"
                >
                  <WrapText size={12} />
                  <span>格式化</span>
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="复制配置到剪贴板"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-green-500" />
                      <span className="text-green-500">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>复制</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className={`flex-1 w-full p-3 font-mono text-sm bg-gray-50 dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-0 ${
                jsonError
                  ? "border-red-300 dark:border-red-700"
                  : "border-gray-200 dark:border-gray-700"
              }`}
              spellCheck={false}
            />
            {jsonError && (
              <p className="mt-1 text-xs text-red-500 flex items-start gap-1">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{jsonError}</span>
              </p>
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <Button onClick={onClose} variant="secondary">
            取消
          </Button>
          <Button onClick={handleSave} variant="primary" disabled={saving || !canSave}>
            {saving ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : (
              <Save size={14} className="mr-1" />
            )}
            {isCreateMode ? "创建" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
