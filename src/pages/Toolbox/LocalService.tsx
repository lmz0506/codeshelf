import { useState, useEffect, useRef } from "react";
import {
  Globe,
  ArrowLeftRight,
  Plus,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Loader2,
  Edit2,
  ExternalLink,
  FolderOpen,
  X,
  Copy,
  Check,
  AlertTriangle,
  FileCode,
  Download,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { ToolPanelHeader } from "./index";
import { Input, Button } from "@/components/ui";
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
  formatBytes,
  generateNginxConfig,
} from "@/services/toolbox";
import type { ServerConfig, ServerConfigInput, ProxyConfig, ForwardRule, ForwardRuleInput } from "@/types/toolbox";

interface LocalServiceProps {
  onBack: () => void;
}

type ServiceType = "web" | "forward";
type TabType = "all" | "web" | "forward";

const NGINX_SNIPPETS = [
  {
    title: "基础 Server",
    description: "端口、域名、字符集",
    code: `server {
    listen 80;
    server_name example.com;
    charset utf-8;
}`,
  },
  {
    title: "静态目录",
    description: "root + try_files",
    code: `root /var/www/html;
index index.html index.htm;

location / {
    try_files $uri $uri/ =404;
}`,
  },
  {
    title: "SPA 回退",
    description: "前端路由刷新不 404",
    code: `location / {
    try_files $uri $uri/ /index.html;
}`,
  },
  {
    title: "路径前缀",
    description: "alias 挂载子路径",
    code: `location /app/ {
    alias /var/www/app/;
    index index.html;
    try_files $uri $uri/ /app/index.html;
}`,
  },
  {
    title: "API 代理",
    description: "反向代理到后端",
    code: `location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}`,
  },
  {
    title: "WebSocket",
    description: "升级连接头",
    code: `location /ws/ {
    proxy_pass http://127.0.0.1:3000/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}`,
  },
  {
    title: "CORS",
    description: "跨域与预检",
    code: `add_header Access-Control-Allow-Origin * always;
add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;

if ($request_method = OPTIONS) {
    return 204;
}`,
  },
  {
    title: "Gzip",
    description: "文本资源压缩",
    code: `gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types
    text/plain
    text/css
    application/json
    application/javascript
    text/xml
    application/xml
    image/svg+xml;`,
  },
  {
    title: "缓存策略",
    description: "静态资源长缓存",
    code: `location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}`,
  },
  {
    title: "上传大小",
    description: "放开请求体限制",
    code: `client_max_body_size 50m;`,
  },
  {
    title: "日志",
    description: "访问和错误日志",
    code: `access_log /var/log/nginx/app_access.log;
error_log /var/log/nginx/app_error.log warn;`,
  },
  {
    title: "HTTPS",
    description: "证书配置骨架",
    code: `listen 443 ssl http2;
server_name example.com;

ssl_certificate /etc/nginx/certs/example.com.pem;
ssl_certificate_key /etc/nginx/certs/example.com.key;
ssl_protocols TLSv1.2 TLSv1.3;`,
  },
];

export function LocalService({ onBack }: LocalServiceProps) {
  const nginxEditorRef = useRef<HTMLTextAreaElement>(null);
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
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "server" | "forward";
    id: string;
    name: string;
  } | null>(null);

  // 复制 URL 状态
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nginxPreview, setNginxPreview] = useState<{
    server: ServerConfig;
    content: string;
  } | null>(null);

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
  function getServerUrl(server: ServerConfig): string {
    const prefix = server.urlPrefix === "/" ? "" : server.urlPrefix;
    const base = `http://127.0.0.1:${server.port}${prefix}`;

    if (server.indexPage) {
      const index = server.indexPage.startsWith("/") ? server.indexPage : `/${server.indexPage}`;
      return `${base}${index}`;
    }

    return `${base}/`;
  }

  // 获取端口转发的访问 URL（包含文档路径）
  function getForwardUrl(rule: ForwardRule): string {
    const base = `http://127.0.0.1:${rule.localPort}`;
    if (rule.docPath) {
      const docPath = rule.docPath.startsWith("/") ? rule.docPath : `/${rule.docPath}`;
      return `${base}${docPath}`;
    }
    return base;
  }

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

  function nginxFileName(server: ServerConfig): string {
    const safeName = server.name.trim().replace(/[^\w\u4e00-\u9fa5.-]+/g, "-") || "service";
    return `${safeName}-nginx.conf`;
  }

  async function handleGenerateNginx(server: ServerConfig) {
    try {
      const content = await generateNginxConfig(server.id);
      setNginxPreview({ server, content });
    } catch (error) {
      console.error("生成 Nginx 配置失败:", error);
      alert(`生成 Nginx 配置失败: ${error}`);
    }
  }

  async function handleCopyNginxConfig() {
    if (!nginxPreview) return;
    try {
      await navigator.clipboard.writeText(nginxPreview.content);
      setCopiedId(`nginx-${nginxPreview.server.id}`);
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

  function handleInsertNginxSnippet(code: string) {
    if (!nginxPreview) return;
    const editor = nginxEditorRef.current;
    const snippet = `\n\n${code}\n`;
    if (!editor) {
      setNginxPreview({ ...nginxPreview, content: `${nginxPreview.content}${snippet}` });
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const nextContent = `${nginxPreview.content.slice(0, start)}${snippet}${nginxPreview.content.slice(end)}`;
    setNginxPreview({ ...nginxPreview, content: nextContent });

    requestAnimationFrame(() => {
      editor.focus();
      const pos = start + snippet.length;
      editor.setSelectionRange(pos, pos);
    });
  }

  async function handleSaveNginxConfig() {
    if (!nginxPreview) return;
    try {
      const path = await save({
        title: "保存 Nginx 配置",
        defaultPath: nginxFileName(nginxPreview.server),
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
          {/* Tab 切换 */}
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
            <div className="space-y-4">
              {/* Web 服务列表 */}
              {filteredServers.map((server) => (
                <div
                  key={`server-${server.id}`}
                  className="re-card p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* 状态指示器 */}
                      <div className="flex items-center gap-2">
                        <Globe size={18} className="text-blue-500" />
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            server.status === "running"
                              ? "bg-green-500 animate-pulse"
                              : "bg-gray-300"
                          }`}
                        />
                      </div>

                      {/* 服务信息 */}
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {server.name}
                          <span className="ml-2 text-xs text-gray-400">Web 服务</span>
                        </h4>
                        {/* 访问地址 */}
                        <div className="flex items-center gap-2 mt-1">
                          {server.status === "running" ? (
                            <>
                              <button
                                onClick={() => handleOpenBrowser(server)}
                                className="text-sm font-mono text-blue-500 hover:text-blue-600 hover:underline"
                                title="点击在浏览器中打开"
                              >
                                {getServerUrl(server)}
                              </button>
                              <button
                                onClick={() => handleCopyUrl(server)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                title="复制地址"
                              >
                                {copiedId === server.id ? (
                                  <Check size={14} className="text-green-500" />
                                ) : (
                                  <Copy size={14} className="text-gray-400" />
                                )}
                              </button>
                              <span className="text-xs text-gray-400" title="局域网内其他设备可通过本机 IP 访问">
                                (内网可访问 :{server.port})
                              </span>
                            </>
                          ) : (
                            <span className="text-sm font-mono text-gray-400">
                              {getServerUrl(server)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5 truncate max-w-xs" title={server.rootDir}>
                          {server.rootDir}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {server.cors && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              CORS
                            </span>
                          )}
                          {server.gzip && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              GZIP
                            </span>
                          )}
                          {server.proxies && server.proxies.map((proxy, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              title={`${proxy.prefix} → ${proxy.target}`}
                            >
                              {proxy.prefix} → {proxy.target}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleGenerateNginx(server)}
                        className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors text-indigo-500"
                        title="生成 Nginx 配置"
                      >
                        <FileCode size={16} />
                      </button>
                      {server.status === "running" ? (
                        <>
                          <button
                            onClick={() => handleOpenBrowser(server)}
                            className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-blue-500"
                            title="在浏览器中打开"
                          >
                            <ExternalLink size={16} />
                          </button>
                          <button
                            onClick={() => handleStopServer(server.id)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-500"
                            title="停止"
                          >
                            <Square size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartServer(server.id)}
                            className="p-2 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-green-500"
                            title="启动"
                          >
                            <Play size={16} />
                          </button>
                          <button
                            onClick={() => openEditServerDialog(server)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
                            title="编辑"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleRemoveServer(server)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-500"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* 端口转发列表 */}
              {filteredRules.map((rule) => (
                <div
                  key={`rule-${rule.id}`}
                  className="re-card p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* 状态指示器 */}
                      <div className="flex items-center gap-2">
                        <ArrowLeftRight size={18} className="text-purple-500" />
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            rule.status === "running"
                              ? "bg-green-500 animate-pulse"
                              : "bg-gray-300"
                          }`}
                        />
                      </div>

                      {/* 规则信息 */}
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {rule.name}
                          <span className="ml-2 text-xs text-gray-400">端口转发</span>
                        </h4>
                        {/* 访问地址 */}
                        <div className="flex items-center gap-2 mt-1">
                          {rule.status === "running" ? (
                            <>
                              <button
                                onClick={() => handleOpenForwardBrowser(rule)}
                                className="text-sm font-mono text-purple-500 hover:text-purple-600 hover:underline"
                                title="点击在浏览器中打开"
                              >
                                {getForwardUrl(rule)}
                              </button>
                              <button
                                onClick={() => handleCopyForwardUrl(rule)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                title="复制地址"
                              >
                                {copiedId === rule.id ? (
                                  <Check size={14} className="text-green-500" />
                                ) : (
                                  <Copy size={14} className="text-gray-400" />
                                )}
                              </button>
                            </>
                          ) : (
                            <span className="text-sm font-mono text-gray-400">
                              {getForwardUrl(rule)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          <span className="font-mono">:{rule.localPort}</span>
                          <ArrowLeftRight size={14} />
                          <span className="font-mono">
                            {rule.remoteHost}:{rule.remotePort}
                          </span>
                          {rule.docPath && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              {rule.docPath}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 统计和操作 */}
                    <div className="flex items-center gap-6">
                      {/* 统计信息 */}
                      {rule.status === "running" && (
                        <div className="text-sm text-gray-500 space-y-0.5">
                          <div>连接: <span className="font-medium">{rule.connections}</span></div>
                          <div>
                            入: <span className="font-medium">{formatBytes(rule.bytesIn)}</span>
                            {" | "}
                            出: <span className="font-medium">{formatBytes(rule.bytesOut)}</span>
                          </div>
                        </div>
                      )}

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1">
                        {rule.status === "running" ? (
                          <>
                            <button
                              onClick={() => handleOpenForwardBrowser(rule)}
                              className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors text-purple-500"
                              title="在浏览器中打开"
                            >
                              <ExternalLink size={16} />
                            </button>
                            <button
                              onClick={() => handleStopForward(rule.id)}
                              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-500"
                              title="停止"
                            >
                              <Square size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartForward(rule.id)}
                              className="p-2 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-green-500"
                              title="启动"
                            >
                              <Play size={16} />
                            </button>
                            <button
                              onClick={() => openEditRuleDialog(rule)}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
                              title="编辑"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleRemoveRule(rule)}
                              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-500"
                              title="删除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑对话框 */}
      {showAddDialog && (
        <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editingServer || editingRule ? "编辑服务" : "创建服务"}
            </h3>

            {/* 服务类型选择（仅新建时） */}
            {!editingServer && !editingRule && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-500 mb-2">
                  服务类型
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={serviceType === "web"}
                      onChange={() => setServiceType("web")}
                      className="text-blue-500"
                    />
                    <Globe size={16} className="text-blue-500" />
                    <span className="text-sm">Web 服务</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={serviceType === "forward"}
                      onChange={() => setServiceType("forward")}
                      className="text-blue-500"
                    />
                    <ArrowLeftRight size={16} className="text-purple-500" />
                    <span className="text-sm">端口转发</span>
                  </label>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* 通用：服务名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">
                  服务名称
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={serviceType === "web" ? "如: 前端开发服务" : "如: 本地开发代理"}
                />
              </div>

              {serviceType === "web" ? (
                /* Web 服务表单 */
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      端口号
                    </label>
                    <Input
                      type="number"
                      value={formPort}
                      onChange={(e) => setFormPort(e.target.value)}
                      placeholder="如: 8080"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      静态文件目录
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={formRootDir}
                        onChange={(e) => setFormRootDir(e.target.value)}
                        placeholder="选择或输入目录路径"
                        className="flex-1"
                      />
                      <Button onClick={handleSelectDir} variant="secondary">
                        <FolderOpen size={16} />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      访问前缀
                    </label>
                    <Input
                      value={formUrlPrefix}
                      onChange={(e) => setFormUrlPrefix(e.target.value)}
                      placeholder="默认使用目录名，如 /dist，输入 / 表示无前缀"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      设置访问 URL 前缀，默认使用目录名。输入 "/" 表示无前缀（直接访问根路径）
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      首页文件 <span className="text-gray-400 font-normal">(可选)</span>
                    </label>
                    <Input
                      value={formIndexPage}
                      onChange={(e) => setFormIndexPage(e.target.value)}
                      placeholder="如: index.html、index、home.html"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      设置默认首页文件，启动后将自动打开该页面。留空则访问根路径
                    </p>
                  </div>

                  {/* 选项 */}
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formCors}
                        onChange={(e) => setFormCors(e.target.checked)}
                        className="rounded text-blue-500"
                      />
                      <span className="text-sm">启用 CORS</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formGzip}
                        onChange={(e) => setFormGzip(e.target.checked)}
                        className="rounded text-blue-500"
                      />
                      <span className="text-sm">启用 GZIP 压缩</span>
                    </label>
                  </div>

                  {/* 代理规则 */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        API 代理规则
                      </span>
                      <button
                        onClick={addProxyRule}
                        className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
                      >
                        <Plus size={14} />
                        添加规则
                      </button>
                    </div>

                    {formProxies.length === 0 ? (
                      <p className="text-sm text-gray-400">暂无代理规则，点击"添加规则"配置 API 代理</p>
                    ) : (
                      <div className="space-y-3">
                        {formProxies.map((proxy, index) => (
                          <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex-1 space-y-2">
                              <Input
                                value={proxy.prefix}
                                onChange={(e) => updateProxyRule(index, "prefix", e.target.value)}
                                placeholder="本地访问路径，如: /api"
                              />
                              <Input
                                value={proxy.target}
                                onChange={(e) => updateProxyRule(index, "target", e.target.value)}
                                placeholder="代理目标地址，如: http://192.168.1.100:8080/api"
                              />
                            </div>
                            <button
                              onClick={() => removeProxyRule(index)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                        <p className="text-xs text-gray-400">
                          访问本地路径的请求将被转发到代理目标地址，如: /api/* → http://192.168.1.100:8080/api/*
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* 端口转发表单 */
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      本地端口
                    </label>
                    <Input
                      type="number"
                      value={formLocalPort}
                      onChange={(e) => setFormLocalPort(e.target.value)}
                      placeholder="如: 8080"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      远程主机
                    </label>
                    <Input
                      value={formRemoteHost}
                      onChange={(e) => setFormRemoteHost(e.target.value)}
                      placeholder="如: 192.168.1.100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      远程端口
                    </label>
                    <Input
                      type="number"
                      value={formRemotePort}
                      onChange={(e) => setFormRemotePort(e.target.value)}
                      placeholder="如: 3000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      文档路径 <span className="text-gray-400 font-normal">(可选)</span>
                    </label>
                    <Input
                      value={formDocPath}
                      onChange={(e) => setFormDocPath(e.target.value)}
                      placeholder="如: doc.html、swagger-ui.html"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      设置快捷访问路径，如 API 文档页面。留空则直接访问根路径
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                onClick={() => {
                  setShowAddDialog(false);
                  resetForm();
                }}
                variant="secondary"
              >
                取消
              </Button>
              <Button onClick={handleSubmit} variant="primary">
                {editingServer || editingRule ? "保存" : "创建"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Nginx 配置预览 */}
      {nginxPreview && (
        <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl mx-4 p-6 h-[88vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Nginx 配置
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {nginxPreview.server.name} · :{nginxPreview.server.port} · {nginxPreview.server.urlPrefix}
                </p>
              </div>
              <button
                onClick={() => setNginxPreview(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="关闭"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-[280px_minmax(0,1fr)] gap-4">
              <div className="min-h-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100">基础配置手册</div>
                  <div className="text-xs text-gray-400 mt-0.5">选择片段插入或复制</div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {NGINX_SNIPPETS.map((snippet) => (
                    <div
                      key={snippet.title}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {snippet.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {snippet.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleInsertNginxSnippet(snippet.code)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="插入到配置"
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            onClick={() => handleCopyNginxSnippet(snippet.code)}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="复制片段"
                          >
                            {copiedId === `nginx-snippet-${snippet.code}` ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                      <pre className="mt-2 max-h-24 overflow-hidden rounded bg-white dark:bg-gray-950 px-2 py-1.5 text-[10px] leading-4 text-gray-500 dark:text-gray-400 font-mono whitespace-pre-wrap">
                        {snippet.code}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <textarea
                ref={nginxEditorRef}
                value={nginxPreview.content}
                onChange={(e) => setNginxPreview({ ...nginxPreview, content: e.target.value })}
                spellCheck={false}
                className="min-h-0 w-full resize-none overflow-auto bg-gray-950 text-gray-100 rounded-lg p-4 text-xs leading-5 font-mono outline-none border border-gray-900 focus:border-blue-500 whitespace-pre"
              />
            </div>

            <div className="flex items-center justify-between gap-3 mt-4">
              <div className="text-xs text-gray-400">
                可直接编辑配置；保存后可放入 nginx 的 conf.d 目录。
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleCopyNginxConfig} variant="secondary">
                  {copiedId === `nginx-${nginxPreview.server.id}` ? (
                    <Check size={14} className="mr-2 text-green-500" />
                  ) : (
                    <Copy size={14} className="mr-2" />
                  )}
                  复制
                </Button>
                <Button onClick={handleSaveNginxConfig} variant="primary">
                  <Download size={14} className="mr-2" />
                  保存 .conf
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirm && (
        <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                确认删除
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              确定要删除{deleteConfirm.type === "server" ? "服务" : "转发规则"}{" "}
              <span className="font-medium text-gray-900 dark:text-white">"{deleteConfirm.name}"</span> 吗？
              此操作无法撤销。
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setDeleteConfirm(null)}
                variant="secondary"
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  if (deleteConfirm.type === "server") {
                    confirmRemoveServer();
                  } else {
                    confirmRemoveRule();
                  }
                }}
                variant="primary"
                className="!bg-red-500 hover:!bg-red-600"
              >
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
