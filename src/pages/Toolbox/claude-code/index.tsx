// Claude Code 配置管理器 - 主组件

import { showToast } from "@/components/ui/Toast";
import { useState, useEffect } from "react";
import {
  Terminal,
  RefreshCw,
  FolderOpen,
  FileText,
  AlertCircle,
  Sliders,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { ToolPanelHeader } from "../index";
import { Button } from "@/components/ui";
import { LoadingSpinner } from "@/components/common";
import {
  checkAllClaudeInstallations,
  checkClaudeByPath,
  readClaudeConfigFile,
  writeClaudeConfigFile,
  openClaudeConfigDir,
  getConfigProfiles,
  deleteConfigProfile,
  saveConfigProfile,
  scanClaudeConfigDir,
  getWslConfigDir,
  getClaudeInstallationsCache,
  saveClaudeInstallationsCache,
  clearClaudeInstallationsCache,
  launchClaudeInTerminal,
  getClaudeLaunchDirs,
  saveClaudeLaunchDirs,
  getRecommendedTemplate,
  saveRecommendedTemplate,
  resetRecommendedTemplate,
} from "@/services/toolbox";
import type { ClaudeCodeInfo, ConfigFileInfo, ConfigProfile } from "@/types/toolbox";
import { useAppStore } from "@/stores/appStore";
import { type QuickConfigOption, loadQuickConfigs } from "./constants";
import { ProfileEditor } from "./ProfileEditor";
import { QuickConfigManager } from "./QuickConfigManager";
import { LaunchClaudeMenu } from "./components/LaunchClaudeMenu";
import { EnvironmentCard } from "./components/EnvironmentCard";
import { ConfigFilesList } from "./components/ConfigFilesList";
import { ProfilesCard } from "./components/ProfilesCard";
import { FileViewerCard } from "./components/FileViewerCard";
import {
  ActivateConfirmDialog,
  ConfigReferenceDialog,
  DeleteConfirmDialog,
} from "./dialogs/ProfileDialogs";
import {
  EditConfigDirDialog,
  FindClaudeHelpDialog,
  WslClaudePathDialog,
} from "./dialogs/ClaudePathDialogs";
import {
  ManageLaunchDirsDialog,
  ManualLaunchDialog,
} from "./dialogs/LaunchDialogs";

interface ClaudeCodeManagerProps {
  onBack: () => void;
}

export function ClaudeCodeManager({ onBack }: ClaudeCodeManagerProps) {
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState<ClaudeCodeInfo[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<ClaudeCodeInfo | null>(null);

  const [selectedFile, setSelectedFile] = useState<ConfigFileInfo | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editingFileContent, setEditingFileContent] = useState("");
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [showConfigReference, setShowConfigReference] = useState(false);

  const [currentSettings, setCurrentSettings] = useState("");
  const [showCurrentSettings, setShowCurrentSettings] = useState(false);

  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [quickConfigs, setQuickConfigs] = useState<QuickConfigOption[]>([]);
  const [showQuickConfigManager, setShowQuickConfigManager] = useState(false);

  const [editingProfile, setEditingProfile] = useState<ConfigProfile | null>(null);
  const [showCreateProfile, setShowCreateProfile] = useState(false);

  const [recommendedTemplate, setRecommendedTemplate] = useState<string | null>(null);

  const [deleteConfirmProfile, setDeleteConfirmProfile] = useState<ConfigProfile | null>(null);
  const [activateConfirmProfile, setActivateConfirmProfile] = useState<ConfigProfile | null>(null);
  const [activatingProfile, setActivatingProfile] = useState(false);

  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showFindClaudeHelp, setShowFindClaudeHelp] = useState(false);
  const [showEditConfigDir, setShowEditConfigDir] = useState(false);
  const [editingConfigDir, setEditingConfigDir] = useState("");

  const [showWslClaudePathInput, setShowWslClaudePathInput] = useState(false);
  const [wslClaudePath, setWslClaudePath] = useState("");
  const [wslClaudePathError, setWslClaudePathError] = useState<string | null>(null);

  const [launchDirs, setLaunchDirs] = useState<string[]>([]);
  const [showLaunchMenu, setShowLaunchMenu] = useState(false);
  const [showManageLaunchDirs, setShowManageLaunchDirs] = useState(false);
  const [newDirInput, setNewDirInput] = useState("");
  const [showManualLaunchInput, setShowManualLaunchInput] = useState(false);
  const [manualLaunchDir, setManualLaunchDir] = useState("");

  const terminalConfig = useAppStore((s) => s.terminalConfig);

  useEffect(() => {
    loadAll();
    loadQuickConfigs().then(setQuickConfigs);
    getClaudeLaunchDirs().then(setLaunchDirs).catch(console.error);
    getRecommendedTemplate().then(setRecommendedTemplate).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedEnv) {
      loadCurrentSettings();
      loadProfiles();
      const settingsFile = selectedEnv.configFiles.find(f => f.name === "settings.json");
      if (settingsFile) {
        setSelectedFile(settingsFile);
        setIsEditingFile(false);
      } else {
        setSelectedFile(null);
      }
    }
  }, [selectedEnv]);

  async function loadAll(forceRefresh = false) {
    setError(null);

    if (forceRefresh) {
      await clearClaudeInstallationsCache().catch(console.error);
    }

    if (!forceRefresh) {
      try {
        const cached = await getClaudeInstallationsCache();
        if (cached && cached.length > 0) {
          setInstallations(cached);
          if (!selectedEnv) setSelectedEnv(cached[0]);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("读取缓存失败:", err);
      }
    }

    setLoading(true);
    try {
      const installs = await checkAllClaudeInstallations();
      setInstallations(installs);
      await saveClaudeInstallationsCache(installs);

      if (installs.length > 0) {
        if (selectedEnv) {
          const updated = installs.find(e => e.envName === selectedEnv.envName);
          setSelectedEnv(updated || installs[0]);
        } else {
          setSelectedEnv(installs[0]);
        }
      }
    } catch (err) {
      console.error("加载数据失败:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadProfiles() {
    if (!selectedEnv) return;
    try {
      const profs = await getConfigProfiles(selectedEnv.envType, selectedEnv.envName);
      setProfiles(profs);
      const active = profs.find(p => (p.settings as Record<string, unknown>)?.__active === true);
      setActiveProfileId(active?.id || null);
    } catch (err) {
      console.error("加载配置档案失败:", err);
    }
  }

  async function loadCurrentSettings() {
    if (!selectedEnv) return;
    const settingsFile = selectedEnv.configFiles.find(f => f.name === "settings.json");
    if (!settingsFile?.exists) {
      setCurrentSettings("{}");
      return;
    }
    try {
      const content = await readClaudeConfigFile(selectedEnv.envType, selectedEnv.envName, settingsFile.path);
      setCurrentSettings(content);
    } catch (err) {
      console.error("加载 settings.json 失败:", err);
      setCurrentSettings("{}");
    }
  }

  async function handleSelectClaudePath() {
    if (!selectedEnv) return;

    if (selectedEnv.envType === "wsl") {
      setWslClaudePath("");
      setWslClaudePathError(null);
      setShowWslClaudePathInput(true);
      return;
    }

    try {
      const selected = await open({
        title: "选择 Claude 可执行文件",
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        await processClaudePath(selected);
      }
    } catch (err) {
      console.error("选择路径失败:", err);
      alert(`选择路径失败: ${err}`);
    }
  }

  async function handleWslClaudePathSubmit() {
    if (!selectedEnv || !wslClaudePath.trim()) return;
    let linuxPath = wslClaudePath.trim();

    if (linuxPath.startsWith("~")) {
      const distro = selectedEnv.envName.replace("WSL: ", "");
      try {
        const configDirInfo = await getWslConfigDir(distro);
        const homeDir = configDirInfo.linuxPath.replace("/.claude", "");
        linuxPath = linuxPath.replace("~", homeDir);
      } catch {
        setWslClaudePathError("无法获取 WSL home 目录，请使用完整路径如 /usr/bin/claude");
        return;
      }
    }

    if (!linuxPath.startsWith("/")) {
      setWslClaudePathError("请输入 Linux 绝对路径，如 /usr/bin/claude 或 ~/.nvm/versions/node/v22/bin/claude");
      return;
    }

    const distro = selectedEnv.envName.replace("WSL: ", "");
    const uncPath = `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, "\\")}`;
    setWslClaudePathError(null);
    await processClaudePath(uncPath);
    setShowWslClaudePathInput(false);
  }

  async function processClaudePath(path: string) {
    if (!selectedEnv) return;
    try {
      const info = await checkClaudeByPath(path);
      if (info.installed) {
        const updatedInstallations = installations.map(env =>
          env.envName === selectedEnv.envName
            ? { ...env, ...info, envName: env.envName, envType: env.envType }
            : env,
        );
        setInstallations(updatedInstallations);
        setSelectedEnv(prev => prev ? { ...prev, ...info, envName: prev.envName, envType: prev.envType } : null);
        saveClaudeInstallationsCache(updatedInstallations).catch(console.error);
      } else {
        alert("无法识别该路径为有效的 Claude Code 安装");
      }
    } catch (checkErr) {
      console.error("路径检测失败:", checkErr);
      alert(`路径检测失败: ${checkErr}`);
    }
  }

  async function loadFile(file: ConfigFileInfo) {
    if (!selectedEnv) return;

    if (file.name === "settings.json") {
      setSelectedFile(file);
      setIsEditingFile(false);
      return;
    }

    if (!file.exists) {
      setSelectedFile(file);
      setFileContent("文件不存在");
      setIsEditingFile(false);
      return;
    }

    setLoadingFile(true);
    try {
      const content = await readClaudeConfigFile(selectedEnv.envType, selectedEnv.envName, file.path);
      setSelectedFile(file);
      setFileContent(content);
      setEditingFileContent(content);
      setIsEditingFile(false);
    } catch (err) {
      console.error("读取文件失败:", err);
      setFileContent(`读取失败: ${err}`);
    } finally {
      setLoadingFile(false);
    }
  }

  async function handleSaveFile() {
    if (!selectedEnv || !selectedFile) return;
    setSavingFile(true);
    try {
      await writeClaudeConfigFile(selectedEnv.envType, selectedEnv.envName, selectedFile.path, editingFileContent);
      setFileContent(editingFileContent);
      setIsEditingFile(false);
    } catch (err) {
      console.error("保存文件失败:", err);
      alert(`保存文件失败: ${err}`);
    } finally {
      setSavingFile(false);
    }
  }

  async function handleOpenDir() {
    if (!selectedEnv?.configDir) return;
    try {
      await openClaudeConfigDir(selectedEnv.envType, selectedEnv.envName, selectedEnv.configDir);
    } catch (err) {
      console.error("打开目录失败:", err);
      alert(`打开目录失败: ${err}`);
    }
  }

  async function handleUpdateConfigDir() {
    if (!selectedEnv || !editingConfigDir.trim()) return;
    let configDir = editingConfigDir.trim();

    if (selectedEnv.envType === "wsl") {
      const distro = selectedEnv.envName.replace("WSL: ", "");
      if (configDir.startsWith("~")) {
        try {
          const configDirInfo = await getWslConfigDir(distro);
          const homeDir = configDirInfo.linuxPath.replace("/.claude", "");
          configDir = configDir.replace("~", homeDir);
        } catch {
          alert("无法获取 WSL home 目录，请使用完整路径如 /home/用户名/.claude");
          return;
        }
      }
      if (!configDir.startsWith("/")) {
        alert("请输入 Linux 绝对路径，如 /home/用户名/.claude 或 ~/.claude");
        return;
      }
      configDir = `\\\\wsl.localhost\\${distro}${configDir.replace(/\//g, "\\")}`;
    }

    try {
      const newConfigFiles = await scanClaudeConfigDir(selectedEnv.envType, selectedEnv.envName, configDir);
      const updatedEnv = { ...selectedEnv, configDir, configFiles: newConfigFiles };
      const updatedInstallations = installations.map(env => env.envName === selectedEnv.envName ? updatedEnv : env);
      setInstallations(updatedInstallations);
      setSelectedEnv(updatedEnv);
      setShowEditConfigDir(false);
      setSelectedFile(null);
      saveClaudeInstallationsCache(updatedInstallations).catch(console.error);
    } catch (err) {
      console.error("更新配置目录失败:", err);
      alert(`更新配置目录失败: ${err}`);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  }

  async function handleActivateProfile(profile: ConfigProfile) {
    if (!selectedEnv) return;
    setActivatingProfile(true);
    try {
      const settings = { ...(profile.settings as Record<string, unknown>) };
      delete settings.__active;

      const settingsFile = selectedEnv.configFiles.find(f => f.name === "settings.json");
      if (!settingsFile) return;

      const content = JSON.stringify(settings, null, 2);
      await writeClaudeConfigFile(selectedEnv.envType, selectedEnv.envName, settingsFile.path, content);

      for (const p of profiles) {
        const pSettings = { ...(p.settings as Record<string, unknown>) };
        if (p.id === profile.id) pSettings.__active = true;
        else delete pSettings.__active;
        await saveConfigProfile(selectedEnv.envType, selectedEnv.envName, p.name, p.description, pSettings);
      }

      setActiveProfileId(profile.id);
      await loadCurrentSettings();
      await loadProfiles();
    } catch (err) {
      console.error("启用档案失败:", err);
      alert(`启用配置档案失败: ${err}`);
    } finally {
      setActivatingProfile(false);
    }
  }

  async function handleSaveProfile(description: string | undefined, content: string) {
    if (!editingProfile || !selectedEnv) return;
    try {
      const settings = JSON.parse(content);
      if (activeProfileId === editingProfile.id) settings.__active = true;
      await saveConfigProfile(selectedEnv.envType, selectedEnv.envName, editingProfile.name, description, settings);

      if (activeProfileId === editingProfile.id) {
        const settingsFile = selectedEnv.configFiles.find(f => f.name === "settings.json");
        if (settingsFile) {
          const cleanSettings = { ...settings };
          delete cleanSettings.__active;
          await writeClaudeConfigFile(
            selectedEnv.envType,
            selectedEnv.envName,
            settingsFile.path,
            JSON.stringify(cleanSettings, null, 2),
          );
          await loadCurrentSettings();
        }
      }
      setEditingProfile(null);
      await loadProfiles();
    } catch (err) {
      console.error("保存档案失败:", err);
      alert(`保存配置档案失败: ${err}`);
    }
  }

  async function handleCreateProfileFromEditor(name: string, description: string | undefined, content: string) {
    if (!selectedEnv) return;
    try {
      const settings = JSON.parse(content);
      await saveConfigProfile(selectedEnv.envType, selectedEnv.envName, name, description, settings);
      setShowCreateProfile(false);
      await loadProfiles();
    } catch (err) {
      console.error("创建档案失败:", err);
      alert(`创建配置档案失败: ${err}`);
    }
  }

  async function handleSaveRecommendedTemplate(content: string) {
    await saveRecommendedTemplate(content);
    setRecommendedTemplate(content);
  }

  async function handleResetRecommendedTemplate() {
    await resetRecommendedTemplate();
    setRecommendedTemplate(null);
  }

  async function handleSetAsTemplate(profile: ConfigProfile) {
    const settings = { ...(profile.settings as Record<string, unknown>) };
    delete settings.__active;
    const content = JSON.stringify(settings, null, 2);
    await saveRecommendedTemplate(content);
    setRecommendedTemplate(content);
    showToast("success", "设为推荐模板", `已将「${profile.name}」的配置设为推荐模板`);
  }

  async function confirmDeleteProfile() {
    if (!deleteConfirmProfile || !selectedEnv) return;
    try {
      await deleteConfigProfile(selectedEnv.envType, selectedEnv.envName, deleteConfirmProfile.id);
      setDeleteConfirmProfile(null);
      await loadProfiles();
    } catch (err) {
      console.error("删除档案失败:", err);
      alert(`删除配置档案失败: ${err}`);
    }
  }

  async function handleExportProfiles(profile?: ConfigProfile) {
    const profilesToExport = profile ? [profile] : profiles;
    if (profilesToExport.length === 0) {
      alert("没有可导出的配置档案");
      return;
    }

    try {
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        profiles: profilesToExport.map(p => ({
          name: p.name,
          description: p.description,
          settings: p.settings,
        })),
      };

      const defaultFileName = profile
        ? `claude-profile-${profile.name.replace(/[^a-zA-Z0-9一-龥]/g, "_")}.json`
        : `claude-profiles-${selectedEnv?.envName?.replace(/[^a-zA-Z0-9]/g, "_") || "export"}.json`;

      const filePath = await save({
        title: profile ? `导出配置档案: ${profile.name}` : "导出全部配置档案",
        defaultPath: defaultFileName,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (filePath) {
        const content = JSON.stringify(exportData, null, 2);
        await writeTextFile(filePath, content);
        alert(profile ? `已导出配置档案: ${profile.name}` : `成功导出 ${profilesToExport.length} 个配置档案`);
      }
    } catch (err) {
      console.error("导出失败:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(`导出配置档案失败: ${errorMsg}`);
    }
  }

  async function handleImportProfiles() {
    if (!selectedEnv) return;
    try {
      const filePath = await open({
        title: "导入配置档案",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath || typeof filePath !== "string") return;

      const content = await readTextFile(filePath);
      const importData = JSON.parse(content);

      if (!importData.profiles || !Array.isArray(importData.profiles)) {
        alert("无效的配置档案文件格式");
        return;
      }

      const duplicates = importData.profiles.filter(
        (p: { name: string }) => profiles.find(existing => existing.name === p.name),
      );

      let overwrite = false;
      if (duplicates.length > 0) {
        const duplicateNames = duplicates.map((p: { name: string }) => p.name).join(", ");
        overwrite = confirm(
          `以下配置档案已存在：\n${duplicateNames}\n\n是否覆盖这些档案？\n\n点击"确定"覆盖，点击"取消"跳过已存在的档案。`,
        );
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const profile of importData.profiles) {
        if (!profile.name || typeof profile.settings !== "object") {
          skipped++;
          continue;
        }

        const exists = profiles.find(p => p.name === profile.name);
        if (exists) {
          if (overwrite) {
            await deleteConfigProfile(selectedEnv.envType, selectedEnv.envName, exists.id);
            await saveConfigProfile(
              selectedEnv.envType,
              selectedEnv.envName,
              profile.name,
              profile.description,
              profile.settings,
            );
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        await saveConfigProfile(
          selectedEnv.envType,
          selectedEnv.envName,
          profile.name,
          profile.description,
          profile.settings,
        );
        imported++;
      }

      await loadProfiles();

      const messages = [];
      if (imported > 0) messages.push(`新增 ${imported} 个`);
      if (updated > 0) messages.push(`更新 ${updated} 个`);
      if (skipped > 0) messages.push(`跳过 ${skipped} 个`);
      alert(`导入完成：${messages.join("，")}`);
    } catch (err) {
      console.error("导入失败:", err);
      alert(`导入配置档案失败: ${err}`);
    }
  }

  async function handleLaunchClaude(dir?: string) {
    try {
      await launchClaudeInTerminal(
        dir,
        terminalConfig.type,
        terminalConfig.customPath,
        terminalConfig.paths?.[terminalConfig.type],
        selectedEnv?.envType,
        selectedEnv?.envName,
      );
      setShowLaunchMenu(false);
    } catch (err) {
      console.error("启动 Claude 失败:", err);
      alert(`启动 Claude 失败: ${err}`);
    }
  }

  async function handleAddLaunchDirFromPicker() {
    try {
      const selected = await open({
        title: "选择常用目录",
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        await addLaunchDir(selected);
      }
    } catch (err) {
      console.error("添加目录失败:", err);
    }
  }

  async function addLaunchDir(dir: string) {
    const trimmed = dir.trim();
    if (!trimmed || launchDirs.includes(trimmed)) return;
    const updated = [...launchDirs, trimmed];
    setLaunchDirs(updated);
    await saveClaudeLaunchDirs(updated);
  }

  async function handleRemoveLaunchDir(dir: string) {
    const updated = launchDirs.filter((d) => d !== dir);
    setLaunchDirs(updated);
    await saveClaudeLaunchDirs(updated).catch(console.error);
  }

  const isSettingsJson = selectedFile?.name === "settings.json";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ToolPanelHeader
        title="Claude Code 配置"
        icon={Terminal}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-2">
            <LaunchClaudeMenu
              open={showLaunchMenu}
              onToggle={() => setShowLaunchMenu(!showLaunchMenu)}
              onClose={() => setShowLaunchMenu(false)}
              selectedConfigDir={selectedEnv?.configDir ?? null}
              launchDirs={launchDirs}
              onLaunch={handleLaunchClaude}
              onShowManualInput={() => {
                setManualLaunchDir("");
                setShowManualLaunchInput(true);
                setShowLaunchMenu(false);
              }}
              onShowManageDirs={() => {
                setShowLaunchMenu(false);
                setShowManageLaunchDirs(true);
              }}
            />
            <button
              onClick={() => setShowQuickConfigManager(true)}
              className="re-btn flex items-center gap-2"
              title="快捷配置管理"
            >
              <Sliders size={16} />
              <span>快捷配置</span>
            </button>
            {selectedEnv?.configDir && (
              <button onClick={handleOpenDir} className="re-btn flex items-center gap-2" title="打开配置目录">
                <FolderOpen size={16} />
                <span>打开目录</span>
              </button>
            )}
            <button
              onClick={() => loadAll(true)}
              disabled={loading}
              className="re-btn flex items-center gap-2"
              title="重新检测 Claude Code 安装"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span>刷新</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden p-4">
        {loading ? (
          <LoadingSpinner size={32} label="检测 Claude Code 安装..." className="h-full" />
        ) : error ? (
          <div className="re-card p-6 text-center">
            <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={() => loadAll()} variant="primary">重试</Button>
          </div>
        ) : (
          <div className="flex flex-col h-full gap-4 overflow-hidden">
            {selectedEnv && (
              <EnvironmentCard
                installations={installations}
                selectedEnv={selectedEnv}
                onSelectEnv={(env) => {
                  setSelectedEnv(env);
                  setProfiles([]);
                  setActiveProfileId(null);
                }}
                onSelectClaudePath={handleSelectClaudePath}
                onOpenFindHelp={() => setShowFindClaudeHelp(true)}
                onEditConfigDir={(current) => {
                  setEditingConfigDir(current);
                  setShowEditConfigDir(true);
                }}
              />
            )}

            {selectedEnv && (
              <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
                <ConfigFilesList
                  files={selectedEnv.configFiles}
                  selectedFile={selectedFile}
                  onSelect={loadFile}
                />

                {isSettingsJson ? (
                  <ProfilesCard
                    showCurrentSettings={showCurrentSettings}
                    currentSettings={currentSettings}
                    copiedText={copiedText}
                    profiles={profiles}
                    activeProfileId={activeProfileId}
                    recommendedTemplate={recommendedTemplate}
                    onToggleShowSettings={() => setShowCurrentSettings(!showCurrentSettings)}
                    onCopy={copyToClipboard}
                    onImport={handleImportProfiles}
                    onExport={handleExportProfiles}
                    onCreate={() => setShowCreateProfile(true)}
                    onEdit={setEditingProfile}
                    onActivate={setActivateConfirmProfile}
                    onSetAsTemplate={handleSetAsTemplate}
                    onRequestDelete={setDeleteConfirmProfile}
                  />
                ) : selectedFile ? (
                  <FileViewerCard
                    file={selectedFile}
                    fileContent={fileContent}
                    editingContent={editingFileContent}
                    isEditing={isEditingFile}
                    loading={loadingFile}
                    saving={savingFile}
                    onEditingContentChange={setEditingFileContent}
                    onStartEdit={() => setIsEditingFile(true)}
                    onCancelEdit={() => {
                      setEditingFileContent(fileContent);
                      setIsEditingFile(false);
                    }}
                    onSave={handleSaveFile}
                    onOpenConfigReference={() => setShowConfigReference(true)}
                  />
                ) : (
                  <div className="flex-1 re-card p-3 flex flex-col items-center justify-center text-gray-400">
                    <FileText size={48} className="mb-4 opacity-50" />
                    <p>选择配置文件查看</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateProfile && (
        <ProfileEditor
          mode="create"
          quickConfigs={quickConfigs}
          existingNames={profiles.map(p => p.name)}
          currentSettings={currentSettings}
          recommendedTemplate={recommendedTemplate ?? undefined}
          onSaveRecommendedTemplate={handleSaveRecommendedTemplate}
          onResetRecommendedTemplate={handleResetRecommendedTemplate}
          onSave={handleCreateProfileFromEditor}
          onClose={() => setShowCreateProfile(false)}
        />
      )}

      {editingProfile && (
        <ProfileEditor
          mode="edit"
          profile={editingProfile}
          quickConfigs={quickConfigs}
          isActive={activeProfileId === editingProfile.id}
          onSave={handleSaveProfile}
          onClose={() => setEditingProfile(null)}
        />
      )}

      {showQuickConfigManager && (
        <QuickConfigManager
          quickConfigs={quickConfigs}
          onConfigsChange={setQuickConfigs}
          onClose={() => setShowQuickConfigManager(false)}
        />
      )}

      {showConfigReference && selectedFile?.name && (
        <ConfigReferenceDialog
          fileName={selectedFile.name}
          copiedText={copiedText}
          onCopy={copyToClipboard}
          onClose={() => setShowConfigReference(false)}
        />
      )}

      {activateConfirmProfile && (
        <ActivateConfirmDialog
          profile={activateConfirmProfile}
          activating={activatingProfile}
          onCancel={() => setActivateConfirmProfile(null)}
          onConfirm={async () => {
            await handleActivateProfile(activateConfirmProfile);
            setActivateConfirmProfile(null);
          }}
        />
      )}

      {deleteConfirmProfile && (
        <DeleteConfirmDialog
          profile={deleteConfirmProfile}
          onCancel={() => setDeleteConfirmProfile(null)}
          onConfirm={confirmDeleteProfile}
        />
      )}

      {showFindClaudeHelp && (
        <FindClaudeHelpDialog onClose={() => setShowFindClaudeHelp(false)} />
      )}

      {showEditConfigDir && selectedEnv && (
        <EditConfigDirDialog
          env={selectedEnv}
          value={editingConfigDir}
          onChange={setEditingConfigDir}
          onCancel={() => setShowEditConfigDir(false)}
          onConfirm={handleUpdateConfigDir}
        />
      )}

      {showWslClaudePathInput && selectedEnv && (
        <WslClaudePathDialog
          env={selectedEnv}
          value={wslClaudePath}
          error={wslClaudePathError}
          onChange={(v) => {
            setWslClaudePath(v);
            setWslClaudePathError(null);
          }}
          onCancel={() => setShowWslClaudePathInput(false)}
          onConfirm={handleWslClaudePathSubmit}
        />
      )}

      {showManageLaunchDirs && (
        <ManageLaunchDirsDialog
          launchDirs={launchDirs}
          newDirInput={newDirInput}
          onNewDirInputChange={setNewDirInput}
          onAddDir={addLaunchDir}
          onSelectFolder={handleAddLaunchDirFromPicker}
          onRemoveDir={handleRemoveLaunchDir}
          onClose={() => setShowManageLaunchDirs(false)}
        />
      )}

      {showManualLaunchInput && (
        <ManualLaunchDialog
          value={manualLaunchDir}
          onChange={setManualLaunchDir}
          onCancel={() => setShowManualLaunchInput(false)}
          onLaunch={(dir) => {
            handleLaunchClaude(dir);
            setShowManualLaunchInput(false);
          }}
        />
      )}
    </div>
  );
}
