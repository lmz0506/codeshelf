import { useState, useEffect } from "react";
import {
  Terminal,
  RefreshCw,
  Loader2,
  FolderOpen,
  FileText,
  Plus,
  Save,
  AlertCircle,
  CheckCircle,
  X,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { ToolPanelHeader } from "./index";
import { Button } from "@/components/ui";
import {
  checkAllClaudeInstallations,
  readClaudeConfigFile,
  writeClaudeConfigFile,
  openClaudeConfigDir,
  getQuickConfigOptions,
  applyQuickConfig,
  getConfigProfiles,
  deleteConfigProfile,
  applyConfigProfile,
  createProfileFromCurrent,
} from "@/services/toolbox";
import type { ClaudeCodeInfo, ConfigFileInfo, QuickConfigOption, ConfigProfile } from "@/types/toolbox";

interface ClaudeCodeManagerProps {
  onBack: () => void;
}

type TabType = "quick" | "files" | "profiles";

export function ClaudeCodeManager({ onBack }: ClaudeCodeManagerProps) {
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState<ClaudeCodeInfo[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<ClaudeCodeInfo | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("quick");

  // 快捷配置
  const [quickOptions, setQuickOptions] = useState<QuickConfigOption[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [applyingQuick, setApplyingQuick] = useState(false);

  // 文件编辑
  const [selectedFile, setSelectedFile] = useState<ConfigFileInfo | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState(false);

  // 配置档案
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileDesc, setNewProfileDesc] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // 加载数据
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [installs, options, profs] = await Promise.all([
        checkAllClaudeInstallations(),
        getQuickConfigOptions(),
        getConfigProfiles(),
      ]);
      setInstallations(installs);
      setQuickOptions(options);
      setProfiles(profs);

      // 默认选中第一个环境
      if (installs.length > 0 && !selectedEnv) {
        setSelectedEnv(installs[0]);
      }
    } catch (err) {
      console.error("加载数据失败:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  // 加载文件内容
  async function loadFile(file: ConfigFileInfo) {
    if (!selectedEnv) return;

    if (!file.exists) {
      setSelectedFile(file);
      setFileContent("");
      setModified(false);
      return;
    }

    setLoadingFile(true);
    try {
      const content = await readClaudeConfigFile(selectedEnv.envType, selectedEnv.envName, file.path);
      setSelectedFile(file);
      setFileContent(content);
      setModified(false);
    } catch (err) {
      console.error("读取文件失败:", err);
      alert(`读取配置文件失败: ${err}`);
    } finally {
      setLoadingFile(false);
    }
  }

  // 保存文件
  async function saveFile() {
    if (!selectedFile || !selectedEnv) return;

    setSaving(true);
    try {
      await writeClaudeConfigFile(selectedEnv.envType, selectedEnv.envName, selectedFile.path, fileContent);
      setModified(false);
      await loadAll();
    } catch (err) {
      console.error("保存文件失败:", err);
      alert(`保存配置文件失败: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  // 打开目录
  async function handleOpenDir() {
    if (!selectedEnv?.configDir) return;
    try {
      await openClaudeConfigDir(selectedEnv.envType, selectedEnv.envName, selectedEnv.configDir);
    } catch (err) {
      console.error("打开目录失败:", err);
      alert(`打开目录失败: ${err}`);
    }
  }

  // 应用快捷配置
  async function handleApplyQuickConfig() {
    if (!selectedEnv?.configDir || selectedOptions.size === 0) return;

    setApplyingQuick(true);
    try {
      const configPath = `${selectedEnv.configDir}/settings.json`;
      await applyQuickConfig(selectedEnv.envType, selectedEnv.envName, configPath, Array.from(selectedOptions));
      setSelectedOptions(new Set());
      await loadAll();
      alert("配置已应用");
    } catch (err) {
      console.error("应用配置失败:", err);
      alert(`应用配置失败: ${err}`);
    } finally {
      setApplyingQuick(false);
    }
  }

  // 保存为配置档案
  async function handleSaveProfile() {
    if (!newProfileName.trim() || !selectedEnv?.configDir) return;

    setSavingProfile(true);
    try {
      const configPath = `${selectedEnv.configDir}/settings.json`;
      await createProfileFromCurrent(
        selectedEnv.envType,
        selectedEnv.envName,
        configPath,
        newProfileName.trim(),
        newProfileDesc.trim() || undefined
      );
      setShowSaveProfile(false);
      setNewProfileName("");
      setNewProfileDesc("");
      await loadAll();
    } catch (err) {
      console.error("保存档案失败:", err);
      alert(`保存配置档案失败: ${err}`);
    } finally {
      setSavingProfile(false);
    }
  }

  // 应用配置档案
  async function handleApplyProfile(profile: ConfigProfile) {
    if (!selectedEnv?.configDir) return;

    try {
      const configPath = `${selectedEnv.configDir}/settings.json`;
      await applyConfigProfile(selectedEnv.envType, selectedEnv.envName, configPath, profile.id);
      await loadAll();
      alert(`已应用配置档案: ${profile.name}`);
    } catch (err) {
      console.error("应用档案失败:", err);
      alert(`应用配置档案失败: ${err}`);
    }
  }

  // 删除配置档案
  async function handleDeleteProfile(profile: ConfigProfile) {
    if (!confirm(`确定要删除配置档案 "${profile.name}" 吗？`)) return;

    try {
      await deleteConfigProfile(profile.id);
      await loadAll();
    } catch (err) {
      console.error("删除档案失败:", err);
      alert(`删除配置档案失败: ${err}`);
    }
  }

  // 按分类分组快捷配置
  const groupedOptions = quickOptions.reduce((acc, opt) => {
    if (!acc[opt.category]) {
      acc[opt.category] = [];
    }
    acc[opt.category].push(opt);
    return acc;
  }, {} as Record<string, QuickConfigOption[]>);

  // 格式化文件大小
  function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="Claude Code 配置"
        icon={Terminal}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-2">
            {selectedEnv?.configDir && (
              <button
                onClick={handleOpenDir}
                className="re-btn flex items-center gap-2"
                title="打开配置目录"
              >
                <FolderOpen size={16} />
                <span>打开目录</span>
              </button>
            )}
            <button
              onClick={loadAll}
              disabled={loading}
              className="re-btn flex items-center gap-2"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span>刷新</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 size={32} className="animate-spin mb-4" />
              <p>检测 Claude Code 安装...</p>
            </div>
          ) : error ? (
            <div className="re-card p-6 text-center">
              <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
              <p className="text-red-500 mb-4">{error}</p>
              <Button onClick={loadAll} variant="primary">重试</Button>
            </div>
          ) : (
            <>
              {/* 环境选择器 */}
              <div className="re-card p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">选择环境</h3>
                <div className="flex flex-wrap gap-3">
                  {installations.map((env) => (
                    <button
                      key={`${env.envType}-${env.envName}`}
                      onClick={() => {
                        setSelectedEnv(env);
                        setSelectedFile(null);
                        setFileContent("");
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
                        selectedEnv?.envName === env.envName
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex flex-col items-start">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {env.envName}
                          </span>
                          {env.installed ? (
                            <CheckCircle size={16} className="text-green-500" />
                          ) : (
                            <X size={16} className="text-red-400" />
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {env.installed ? (env.version || "已安装") : "未安装"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedEnv && (
                <>
                  {/* 安装信息 */}
                  <div className="re-card p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">状态</span>
                        <div className="font-medium mt-1 flex items-center gap-1">
                          {selectedEnv.installed ? (
                            <><CheckCircle size={14} className="text-green-500" /> 已安装</>
                          ) : (
                            <><X size={14} className="text-red-400" /> 未安装</>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">版本</span>
                        <div className="font-medium mt-1 font-mono">{selectedEnv.version || "-"}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">路径</span>
                        <div className="font-medium mt-1 font-mono text-xs truncate" title={selectedEnv.path || ""}>
                          {selectedEnv.path || "-"}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">配置目录</span>
                        <div className="font-medium mt-1 font-mono text-xs truncate" title={selectedEnv.configDir || ""}>
                          {selectedEnv.configDir || "-"}
                        </div>
                      </div>
                    </div>

                    {!selectedEnv.installed && (
                      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm">
                        <p className="text-yellow-800 dark:text-yellow-200">
                          Claude Code 未安装。安装命令: <code className="bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">npm install -g @anthropic-ai/claude-code</code>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Tab 切换 */}
                  <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
                    <button
                      onClick={() => setActiveTab("quick")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "quick"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      快捷配置
                    </button>
                    <button
                      onClick={() => setActiveTab("files")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "files"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      配置文件
                    </button>
                    <button
                      onClick={() => setActiveTab("profiles")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "profiles"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      配置档案
                    </button>
                  </div>

                  {/* 快捷配置面板 */}
                  {activeTab === "quick" && (
                    <div className="re-card p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white">快捷配置</h3>
                        <Button
                          onClick={handleApplyQuickConfig}
                          disabled={selectedOptions.size === 0 || applyingQuick}
                          variant="primary"
                          className="flex items-center gap-2"
                        >
                          {applyingQuick ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          应用选中 ({selectedOptions.size})
                        </Button>
                      </div>

                      <p className="text-sm text-gray-500 mb-4">
                        勾选需要的配置选项，点击"应用选中"将自动更新 settings.json
                      </p>

                      <div className="space-y-6">
                        {Object.entries(groupedOptions).map(([category, options]) => (
                          <div key={category}>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{category}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {options.map((opt) => (
                                <label
                                  key={opt.id}
                                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    selectedOptions.has(opt.id)
                                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedOptions.has(opt.id)}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedOptions);
                                      if (e.target.checked) {
                                        // 同一 category 中的选项互斥（同一 configKey）
                                        options.forEach((o) => {
                                          if (o.configKey === opt.configKey && o.id !== opt.id) {
                                            newSet.delete(o.id);
                                          }
                                        });
                                        newSet.add(opt.id);
                                      } else {
                                        newSet.delete(opt.id);
                                      }
                                      setSelectedOptions(newSet);
                                    }}
                                    className="mt-0.5"
                                  />
                                  <div>
                                    <div className="font-medium text-gray-900 dark:text-white text-sm">{opt.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 配置文件面板 */}
                  {activeTab === "files" && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* 文件列表 */}
                      <div className="re-card p-5">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">配置文件</h3>
                        <div className="space-y-2">
                          {selectedEnv.configFiles.map((file) => (
                            <button
                              key={file.path}
                              onClick={() => loadFile(file)}
                              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                                selectedFile?.path === file.path
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <FileText size={16} className={file.exists ? "text-blue-500" : "text-gray-400"} />
                                <span className={`font-medium text-sm ${file.exists ? "" : "text-gray-400"}`}>
                                  {file.name}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">{file.description}</div>
                              {file.exists && (
                                <div className="text-xs text-gray-400 mt-1">
                                  {formatSize(file.size)} · {file.modified}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 编辑器 */}
                      <div className="lg:col-span-2 re-card p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            {selectedFile ? (
                              <>
                                <FileText size={18} />
                                {selectedFile.name}
                                {modified && <span className="text-orange-500 text-sm">(已修改)</span>}
                              </>
                            ) : (
                              "文件内容"
                            )}
                          </h3>
                          {selectedFile && (
                            <Button
                              onClick={saveFile}
                              disabled={!modified || saving}
                              variant="primary"
                              className="flex items-center gap-2"
                            >
                              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                              保存
                            </Button>
                          )}
                        </div>

                        {loadingFile ? (
                          <div className="flex items-center justify-center py-20 text-gray-400">
                            <Loader2 size={32} className="animate-spin" />
                          </div>
                        ) : selectedFile ? (
                          <textarea
                            value={fileContent}
                            onChange={(e) => {
                              setFileContent(e.target.value);
                              setModified(true);
                            }}
                            className="w-full h-96 p-4 font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            placeholder={selectedFile.exists ? "" : "文件不存在，输入内容后保存将创建此文件"}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <FileText size={48} className="mb-4 opacity-50" />
                            <p>选择左侧的配置文件进行查看或编辑</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 配置档案面板 */}
                  {activeTab === "profiles" && (
                    <div className="re-card p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white">配置档案</h3>
                        <Button
                          onClick={() => setShowSaveProfile(true)}
                          variant="primary"
                          className="flex items-center gap-2"
                        >
                          <Plus size={16} />
                          保存当前配置
                        </Button>
                      </div>

                      <p className="text-sm text-gray-500 mb-4">
                        保存不同的配置组合，方便在不同场景下快速切换
                      </p>

                      {profiles.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                          <Copy size={48} className="mx-auto mb-4 opacity-50" />
                          <p>暂无配置档案</p>
                          <p className="text-sm mt-1">点击"保存当前配置"创建第一个档案</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {profiles.map((profile) => (
                            <div
                              key={profile.id}
                              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-medium text-gray-900 dark:text-white">{profile.name}</h4>
                                  {profile.description && (
                                    <p className="text-sm text-gray-500 mt-1">{profile.description}</p>
                                  )}
                                  <p className="text-xs text-gray-400 mt-2">
                                    创建于 {profile.createdAt}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleDeleteProfile(profile)}
                                  className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <Button
                                onClick={() => handleApplyProfile(profile)}
                                variant="secondary"
                                className="w-full mt-3"
                              >
                                应用此配置
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 保存档案对话框 */}
      {showSaveProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              保存配置档案
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">档案名称 *</label>
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="如: 开发环境配置"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">描述</label>
                <input
                  type="text"
                  value={newProfileDesc}
                  onChange={(e) => setNewProfileDesc(e.target.value)}
                  placeholder="可选的描述信息"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button onClick={() => setShowSaveProfile(false)} variant="secondary">取消</Button>
              <Button
                onClick={handleSaveProfile}
                disabled={!newProfileName.trim() || savingProfile}
                variant="primary"
              >
                {savingProfile ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
