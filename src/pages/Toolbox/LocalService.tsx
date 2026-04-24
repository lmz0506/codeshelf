import { useEffect, useState } from "react";
import { FileCode, Globe, Plus, RefreshCw, Loader2 } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { ToolPanelHeader } from "./index";
import { Button } from "@/components/ui";
import {
  createServer,
  startServer,
  stopServer,
  removeServer,
  getServers,
  updateServer,
  addForwardRule,
  removeForwardRule,
  startForwarding,
  stopForwarding,
  getForwardRules,
  updateForwardRule,
  generateNginxConfig,
} from "@/services/toolbox";
import type { ServerConfig, ServerConfigInput, ProxyConfig, ForwardRule, ForwardRuleInput } from "@/types/toolbox";
import { ServiceList } from "./local-service/ServiceList";
import { ServiceFormDialog } from "./local-service/ServiceFormDialog";
import { NginxConfigDialog } from "./local-service/NginxConfigDialog";
import { DeleteConfirmDialog } from "./local-service/DeleteConfirmDialog";
import { getForwardUrl, getServerUrl, nginxFileName } from "./local-service/utils";
import type { DeleteConfirmState, NginxPreviewState, ServiceType, TabType } from "./local-service/types";
import { NGINX_MANUAL_TEMPLATE } from "./local-service/nginxSnippets";

interface LocalServiceProps {
  onBack: () => void;
}

export function LocalService({ onBack }: LocalServiceProps) {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [forwardRules, setForwardRules] = useState<ForwardRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>("web");

  // Web 服务表单状态
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
  const [formName, setFormName] = useState("");
  const [formPort, setFormPort] = useState("8080");
  const [formRootDir, setFormRootDir] = useState("");
  const [formUrlPrefix, setFormUrlPrefix] = useState("");
  const [formIndexPage, setFormIndexPage] = useState("");
  const [formCors, setFormCors] = useState(true);
  const [formGzip, setFormGzip] = useState(true);
  const [formProxies, setFormProxies] = useState<ProxyConfig[]>([]);

  // 端口转发表单状态
  const [editingRule, setEditingRule] = useState<ForwardRule | null>(null);
  const [formLocalPort, setFormLocalPort] = useState("");
  const [formRemoteHost, setFormRemoteHost] = useState("");
  const [formRemotePort, setFormRemotePort] = useState("");
  const [formDocPath, setFormDocPath] = useState("");

  // 删除确认对话框状态
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  // 复制 URL 状态
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nginxPreview, setNginxPreview] = useState<NginxPreviewState | null>(null);

  // 加载数据
  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 2000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    try {
      const [serversData, rulesData] = await Promise.all([
        getServers(),
        getForwardRules(),
      ]);
      setServers(serversData);
      setForwardRules(rulesData);
    } catch (error) {
      console.error("加载服务列表失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 重置表单
  function resetForm() {
    setFormName("");
    setFormPort("8080");
    setFormRootDir("");
    setFormUrlPrefix("");
    setFormIndexPage("");
    setFormCors(true);
    setFormGzip(true);
    setFormProxies([]);
    setFormLocalPort("");
    setFormRemoteHost("");
    setFormRemotePort("");
    setFormDocPath("");
    setEditingServer(null);
    setEditingRule(null);
  }

  // 选择目录
  async function handleSelectDir() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择静态文件目录",
      });
      if (selected) {
        setFormRootDir(selected as string);
        // 自动提取目录名作为默认前缀
        const dirPath = selected as string;
        const parts = dirPath.replace(/\\/g, '/').split('/').filter(Boolean);
        const dirName = parts[parts.length - 1];
        if (dirName && !formUrlPrefix) {
          setFormUrlPrefix(`/${dirName}`);
        }
      }
    } catch (error) {
      console.error("选择目录失败:", error);
    }
  }

  // 添加代理规则
  function addProxyRule() {
    setFormProxies([...formProxies, { prefix: "/api", target: "" }]);
  }

  // 更新代理规则
  function updateProxyRule(index: number, field: "prefix" | "target", value: string) {
    const newProxies = [...formProxies];
    newProxies[index][field] = value;
    setFormProxies(newProxies);
  }

  // 删除代理规则
  function removeProxyRule(index: number) {
    setFormProxies(formProxies.filter((_, i) => i !== index));
  }

  // 打开编辑 Web 服务对话框
  function openEditServerDialog(server: ServerConfig) {
    setServiceType("web");
    setEditingServer(server);
    setFormName(server.name);
    setFormPort(server.port.toString());
    setFormRootDir(server.rootDir);
    setFormUrlPrefix(server.urlPrefix || "/");
    setFormIndexPage(server.indexPage || "");
    setFormCors(server.cors);
    setFormGzip(server.gzip);
    setFormProxies(server.proxies || []);
    setShowAddDialog(true);
  }

  // 打开编辑转发规则对话框
  function openEditRuleDialog(rule: ForwardRule) {
    setServiceType("forward");
    setEditingRule(rule);
    setFormName(rule.name);
    setFormLocalPort(rule.localPort.toString());
    setFormRemoteHost(rule.remoteHost);
    setFormRemotePort(rule.remotePort.toString());
    setFormDocPath(rule.docPath || "");
    setShowAddDialog(true);
  }

  // 提交表单
  async function handleSubmit() {
    if (serviceType === "web") {
      await handleSubmitServer();
    } else {
      await handleSubmitForward();
    }
  }

  // 提交 Web 服务
  async function handleSubmitServer() {
    const port = parseInt(formPort);

    if (!formName.trim() || isNaN(port) || !formRootDir.trim()) {
      alert("请填写完整的配置信息");
      return;
    }

    // 过滤有效的代理规则
    const validProxies = formProxies.filter(p => p.prefix.trim() && p.target.trim());

    const input: ServerConfigInput = {
      name: formName.trim(),
      port,
      rootDir: formRootDir.trim(),
      cors: formCors,
      gzip: formGzip,
      urlPrefix: formUrlPrefix.trim() || "/",
      indexPage: formIndexPage.trim() || null,
      proxies: validProxies.length > 0 ? validProxies : [],
    };

    try {
      if (editingServer) {
        await updateServer(editingServer.id, input);
      } else {
        await createServer(input);
      }
      setShowAddDialog(false);
      resetForm();
      loadAll();
    } catch (error) {
      console.error("保存服务失败:", error);
      alert(`保存服务失败: ${error}`);
    }
  }

  // 提交端口转发
  async function handleSubmitForward() {
    const localPort = parseInt(formLocalPort);
    const remotePort = parseInt(formRemotePort);

    if (!formName.trim() || isNaN(localPort) || !formRemoteHost.trim() || isNaN(remotePort)) {
      alert("请填写完整的配置信息");
      return;
    }

    const input: ForwardRuleInput = {
      name: formName.trim(),
      localPort,
      remoteHost: formRemoteHost.trim(),
      remotePort,
      docPath: formDocPath.trim() || undefined,
    };

    try {
      if (editingRule) {
        await updateForwardRule(editingRule.id, input);
      } else {
        await addForwardRule(input);
      }
      setShowAddDialog(false);
      resetForm();
      loadAll();
    } catch (error) {
      console.error("保存规则失败:", error);
      alert(`保存规则失败: ${error}`);
    }
  }

  // 删除 Web 服务（显示确认对话框）
  function handleRemoveServer(server: ServerConfig) {
    setDeleteConfirm({
      type: "server",
      id: server.id,
      name: server.name,
    });
  }

  // 确认删除 Web 服务
  async function confirmRemoveServer() {
    if (!deleteConfirm || deleteConfirm.type !== "server") return;
    try {
      await removeServer(deleteConfirm.id);
      loadAll();
    } catch (error) {
      console.error("删除服务失败:", error);
    } finally {
      setDeleteConfirm(null);
    }
  }

  // 启动 Web 服务
  async function handleStartServer(serverId: string) {
    try {
      const url = await startServer(serverId);
      loadAll();
      window.open(url, "_blank");
    } catch (error) {
      console.error("启动服务失败:", error);
      alert(`启动服务失败: ${error}`);
    }
  }

  // 停止 Web 服务
  async function handleStopServer(serverId: string) {
    try {
      await stopServer(serverId);
      loadAll();
    } catch (error) {
      console.error("停止服务失败:", error);
    }
  }

  // 删除转发规则（显示确认对话框）
  function handleRemoveRule(rule: ForwardRule) {
    setDeleteConfirm({
      type: "forward",
      id: rule.id,
      name: rule.name,
    });
  }

  // 确认删除转发规则
  async function confirmRemoveRule() {
    if (!deleteConfirm || deleteConfirm.type !== "forward") return;
    try {
      await removeForwardRule(deleteConfirm.id);
      loadAll();
    } catch (error) {
      console.error("删除规则失败:", error);
    } finally {
      setDeleteConfirm(null);
    }
  }

  // 启动转发
  async function handleStartForward(ruleId: string) {
    try {
      await startForwarding(ruleId);
      loadAll();
    } catch (error) {
      console.error("启动转发失败:", error);
      alert(`启动转发失败: ${error}`);
    }
  }

  // 停止转发
  async function handleStopForward(ruleId: string) {
    try {
      await stopForwarding(ruleId);
      loadAll();
    } catch (error) {
      console.error("停止转发失败:", error);
    }
  }

  // 获取服务的完整访问 URL（包含首页）
  // 获取端口转发的访问 URL（包含文档路径）
  // 在浏览器中打开
  async function handleOpenBrowser(server: ServerConfig) {
    const url = getServerUrl(server);
    try {
      await shellOpen(url);
    } catch (error) {
      console.error("打开浏览器失败:", error);
      // 降级到 window.open
      window.open(url, "_blank");
    }
  }

  // 在浏览器中打开端口转发
  async function handleOpenForwardBrowser(rule: ForwardRule) {
    const url = getForwardUrl(rule);
    try {
      await shellOpen(url);
    } catch (error) {
      console.error("打开浏览器失败:", error);
      window.open(url, "_blank");
    }
  }

  // 复制 URL 到剪贴板
  async function handleCopyUrl(server: ServerConfig) {
    const url = getServerUrl(server);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(server.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("复制失败:", error);
    }
  }

  // 复制端口转发 URL 到剪贴板
  async function handleCopyForwardUrl(rule: ForwardRule) {
    const url = getForwardUrl(rule);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(rule.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("复制失败:", error);
    }
  }

  async function handleGenerateNginx(server: ServerConfig) {
    try {
      const content = await generateNginxConfig(server.id);
      setNginxPreview({
        server,
        title: "Nginx 配置",
        subtitle: `${server.name} · :${server.port} · ${server.urlPrefix}`,
        content,
      });
    } catch (error) {
      console.error("生成 Nginx 配置失败:", error);
      alert(`生成 Nginx 配置失败: ${error}`);
    }
  }

  function handleOpenNginxManual() {
    setNginxPreview({
      title: "nginx 配置手册",
      subtitle: "常用配置片段 · 可插入、复制、编辑和保存",
      fileName: "nginx-manual.conf",
      content: NGINX_MANUAL_TEMPLATE,
    });
  }

  async function handleCopyNginxConfig() {
    if (!nginxPreview) return;
    try {
      await navigator.clipboard.writeText(nginxPreview.content);
      setCopiedId(`nginx-${nginxPreview.server?.id ?? "manual"}`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("复制 Nginx 配置失败:", error);
    }
  }

  async function handleCopyNginxSnippet(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(`nginx-snippet-${code}`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("复制 Nginx 片段失败:", error);
    }
  }

  async function handleSaveNginxConfig() {
    if (!nginxPreview) return;
    try {
      const path = await save({
        title: "保存 Nginx 配置",
        defaultPath: nginxPreview.fileName ?? (nginxPreview.server ? nginxFileName(nginxPreview.server) : "nginx.conf"),
        filters: [{ name: "Nginx Config", extensions: ["conf"] }],
      });
      if (!path) return;
      await writeTextFile(path, nginxPreview.content);
    } catch (error) {
      console.error("保存 Nginx 配置失败:", error);
      alert(`保存 Nginx 配置失败: ${error}`);
    }
  }

  // 过滤显示的服务
  const filteredServers = activeTab === "forward" ? [] : servers;
  const filteredRules = activeTab === "web" ? [] : forwardRules;
  const serviceListCallbacks = {
    getServerUrl,
    getForwardUrl,
    onOpenServer: handleOpenBrowser,
    onOpenForward: handleOpenForwardBrowser,
    onCopyServerUrl: handleCopyUrl,
    onCopyForwardUrl: handleCopyForwardUrl,
    onGenerateNginx: handleGenerateNginx,
    onStartServer: handleStartServer,
    onStopServer: handleStopServer,
    onEditServer: openEditServerDialog,
    onRemoveServer: handleRemoveServer,
    onStartForward: handleStartForward,
    onStopForward: handleStopForward,
    onEditForward: openEditRuleDialog,
    onRemoveForward: handleRemoveRule,
  };

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="本地服务"
        icon={Globe}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={loadAll}
              disabled={loading}
              variant="secondary"
              size="sm"
            >
              <RefreshCw size={16} className={loading ? "animate-spin mr-2" : "mr-2"} />
              刷新
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setServiceType("web");
                setShowAddDialog(true);
              }}
              variant="primary"
              size="sm"
            >
              <Plus size={16} className="mr-2" />
              创建服务
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "all"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                全部 ({servers.length + forwardRules.length})
              </button>
              <button
                onClick={() => setActiveTab("web")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "web"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Web 服务 ({servers.length})
              </button>
              <button
                onClick={() => setActiveTab("forward")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "forward"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                端口转发 ({forwardRules.length})
              </button>
            </div>
            <Button onClick={handleOpenNginxManual} variant="secondary" size="sm">
              <FileCode size={16} className="mr-2" />
              nginx 手册
            </Button>
          </div>

          {/* 服务列表 */}
          {loading && servers.length === 0 && forwardRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 size={32} className="animate-spin mb-4" />
              <p>加载中...</p>
            </div>
          ) : filteredServers.length === 0 && filteredRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Globe size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">
                暂无服务
              </p>
              <p className="text-sm mb-4">点击"创建服务"添加 Web 服务或端口转发</p>
              <Button
                onClick={() => {
                  resetForm();
                  setServiceType("web");
                  setShowAddDialog(true);
                }}
                variant="primary"
              >
                <Plus size={16} className="mr-2" />
                创建服务
              </Button>
            </div>
          ) : (
            <ServiceList
              servers={filteredServers}
              rules={filteredRules}
              copiedId={copiedId}
              callbacks={serviceListCallbacks}
            />
          )}
        </div>
      </div>

      {showAddDialog && (
        <ServiceFormDialog
          serviceType={serviceType}
          editingServer={editingServer}
          editingRule={editingRule}
          formName={formName}
          formPort={formPort}
          formRootDir={formRootDir}
          formUrlPrefix={formUrlPrefix}
          formIndexPage={formIndexPage}
          formCors={formCors}
          formGzip={formGzip}
          formProxies={formProxies}
          formLocalPort={formLocalPort}
          formRemoteHost={formRemoteHost}
          formRemotePort={formRemotePort}
          formDocPath={formDocPath}
          onServiceTypeChange={setServiceType}
          onFormNameChange={setFormName}
          onFormPortChange={setFormPort}
          onFormRootDirChange={setFormRootDir}
          onFormUrlPrefixChange={setFormUrlPrefix}
          onFormIndexPageChange={setFormIndexPage}
          onFormCorsChange={setFormCors}
          onFormGzipChange={setFormGzip}
          onFormLocalPortChange={setFormLocalPort}
          onFormRemoteHostChange={setFormRemoteHost}
          onFormRemotePortChange={setFormRemotePort}
          onFormDocPathChange={setFormDocPath}
          onSelectDir={handleSelectDir}
          onAddProxy={addProxyRule}
          onUpdateProxy={updateProxyRule}
          onRemoveProxy={removeProxyRule}
          onCancel={() => {
            setShowAddDialog(false);
            resetForm();
          }}
          onSubmit={handleSubmit}
        />
      )}

      {nginxPreview && (
        <NginxConfigDialog
          preview={nginxPreview}
          copiedId={copiedId}
          onChange={setNginxPreview}
          onClose={() => setNginxPreview(null)}
          onCopyConfig={handleCopyNginxConfig}
          onSaveConfig={handleSaveNginxConfig}
          onCopySnippet={handleCopyNginxSnippet}
        />
      )}

      {deleteConfirm && (
        <DeleteConfirmDialog
          confirm={deleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            if (deleteConfirm.type === "server") {
              confirmRemoveServer();
            } else {
              confirmRemoveRule();
            }
          }}
        />
      )}
    </div>
  );
}
