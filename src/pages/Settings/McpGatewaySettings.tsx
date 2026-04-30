import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Play,
  RefreshCw,
  Server,
  Square,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { Button, showToast } from "@/components/ui";

interface McpGatewayStatus {
  running: boolean;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  startedAt?: string | null;
}

interface McpGatewayKey {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

interface AppSettings {
  mcp_gateway_enabled?: boolean;
  mcp_gateway_host?: string;
  mcp_gateway_port?: number;
  mcp_gateway_keys?: McpGatewayKey[];
}

type ExpiryMode = "never" | "at";

export function McpGatewaySettings() {
  const [status, setStatus] = useState<McpGatewayStatus | null>(null);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("8787");
  const [keys, setKeys] = useState<McpGatewayKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("never");
  const [expiresAtLocal, setExpiresAtLocal] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(loadSavedSettings = false) {
    try {
      if (loadSavedSettings) {
        const settings = await invoke<AppSettings>("get_app_settings");
        setHost(settings.mcp_gateway_host || "127.0.0.1");
        setPort(String(settings.mcp_gateway_port || 8787));
        setKeys(settings.mcp_gateway_keys || []);
      }
      const next = await invoke<McpGatewayStatus>("mcp_gateway_status");
      setStatus(next);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "读取 MCP 网关状态失败");
    }
  }

  useEffect(() => {
    refresh(true);
  }, []);

  const activeKeys = useMemo(() => keys.filter(isActiveKey), [keys]);
  const exampleKey = activeKeys[0]?.key || "YOUR_MCP_KEY";
  const httpUrl = status?.url || `http://${host || "127.0.0.1"}:${port || "8787"}/mcp`;
  const queryUrl = `${httpUrl}?key=${encodeURIComponent(exampleKey)}`;
  const httpConfig = JSON.stringify({
    mcpServers: {
      "codeshelf-api": {
        url: httpUrl,
        headers: {
          Authorization: `Bearer ${exampleKey}`,
        },
      },
    },
  }, null, 2);
  const codexToml = `[mcp_servers.codeshelf-api]\nurl = "${queryUrl}"`;

  async function saveSettings(patch: Partial<AppSettings>) {
    const settings = await invoke<AppSettings>("save_app_settings", { input: patch });
    setHost(settings.mcp_gateway_host || host);
    setPort(String(settings.mcp_gateway_port || port));
    setKeys(settings.mcp_gateway_keys || []);
    const next = await invoke<McpGatewayStatus>("mcp_gateway_status");
    setStatus(next);
    return settings;
  }

  async function startGateway() {
    const parsedPort = Number(port);
    if (!host.trim() || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      showToast("warning", "请填写有效的监听地址和端口");
      return;
    }
    setBusy(true);
    try {
      await saveSettings({
        mcp_gateway_enabled: true,
        mcp_gateway_host: host.trim(),
        mcp_gateway_port: parsedPort,
        mcp_gateway_keys: keys,
      });
      showToast("success", `MCP Gateway 已在 ${host.trim()}:${parsedPort} 启动`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "启动 MCP Gateway 失败");
    } finally {
      setBusy(false);
    }
  }

  async function stopGateway() {
    setBusy(true);
    try {
      await saveSettings({
        mcp_gateway_enabled: false,
        mcp_gateway_host: host.trim() || "127.0.0.1",
        mcp_gateway_port: Number(port) || 8787,
        mcp_gateway_keys: keys,
      });
      showToast("success", "MCP Gateway 已停止");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "停止 MCP Gateway 失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveKeys(nextKeys: McpGatewayKey[]) {
    setKeys(nextKeys);
    try {
      await saveSettings({ mcp_gateway_keys: nextKeys });
      showToast("success", "MCP 密钥已保存");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "保存 MCP 密钥失败");
    }
  }

  async function addKey() {
    const token = keyValue.trim();
    if (!keyName.trim()) {
      showToast("warning", "请填写密钥名称");
      return;
    }
    if (!token) {
      showToast("warning", "请手动输入或自动生成密钥");
      return;
    }
    const expiresAt = expiryMode === "at" ? localDateToIso(expiresAtLocal) : null;
    if (expiryMode === "at" && !expiresAt) {
      showToast("warning", "请选择有效的过期时间");
      return;
    }
    if (keys.some((item) => item.key === token)) {
      showToast("warning", "该密钥已存在");
      return;
    }

    const nextKeys = [
      ...keys,
      {
        id: `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: keyName.trim(),
        key: token,
        enabled: true,
        createdAt: new Date().toISOString(),
        expiresAt,
      },
    ];
    setKeyName("");
    setKeyValue("");
    setExpiryMode("never");
    setExpiresAtLocal("");
    await saveKeys(nextKeys);
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", `${label}已复制`);
    } catch {
      showToast("error", "复制失败");
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900">
          <Server size={18} /> MCP Gateway
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          内置在 CodeShelf 面板里的 MCP Gateway，当前传输模式为流式 HTTP。端口和访问密钥都在这里配置。
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3 bg-white">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            {status?.running
              ? <CheckCircle2 size={16} className="text-emerald-500" />
              : <XCircle size={16} className="text-gray-400" />}
            {status?.running ? "流式 HTTP 网关运行中" : "流式 HTTP 网关未启动"}
            <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">Streamable HTTP</span>
          </div>
          {status?.running && status.url ? (
            <div
              className="text-xs text-gray-500 font-mono mt-1 break-all cursor-copy select-text"
              title="双击复制网关地址"
              onDoubleClick={() => copy(status.url || httpUrl, "网关地址")}
            >
              {status.url}
            </div>
          ) : (
            <div className="text-xs text-gray-500 mt-1">
              网关由 CodeShelf 面板控制，启动后外部 MCP 客户端连接这里。
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => refresh(true)} disabled={busy} title="刷新状态">
            <RefreshCw size={15} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_120px] gap-2 items-end">
        <label className="block text-xs text-gray-700">
          监听地址
          <input
            className="mt-1 h-9 w-full border border-gray-200 rounded px-2 text-sm font-mono"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </label>
        <label className="block text-xs text-gray-700">
          端口
          <input
            className="mt-1 h-9 w-full border border-gray-200 rounded px-2 text-sm font-mono"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </label>
        {status?.running ? (
          <Button variant="danger" onClick={stopGateway} disabled={busy} className="h-9 whitespace-nowrap">
            <Square size={15} className="mr-1" /> 停止
          </Button>
        ) : (
          <Button onClick={startGateway} disabled={busy} className="h-9 whitespace-nowrap">
            <Play size={15} className="mr-1" /> 启动
          </Button>
        )}
      </div>

      <section className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold flex items-center gap-2 text-gray-900">
            <KeyRound size={16} /> 访问密钥
          </div>
          <span className="text-xs text-gray-500">
            {keys.length === 0 ? "未启用鉴权" : `${activeKeys.length}/${keys.length} 个可用`}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)_120px] gap-2 items-start">
          <input
            className="h-9 border border-gray-200 rounded px-2 text-sm"
            placeholder="客户端名称"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
          />
          <input
            className="h-9 min-w-0 border border-gray-200 rounded px-2 text-sm font-mono"
            placeholder="手动输入密钥，或点击自动生成"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
          />
          <Button variant="secondary" onClick={() => setKeyValue(generateToken())} className="h-9 whitespace-nowrap">
            <Wand2 size={15} className="mr-1" /> 生成
          </Button>
        </div>

        <div className={`grid grid-cols-1 gap-2 items-start ${
          expiryMode === "at"
            ? "md:grid-cols-[160px_minmax(0,1fr)_120px]"
            : "md:grid-cols-[160px_120px]"
        }`}>
          <select
            className="h-9 border border-gray-200 rounded px-2 text-sm"
            value={expiryMode}
            onChange={(e) => setExpiryMode(e.target.value as ExpiryMode)}
          >
            <option value="never">永久有效</option>
            <option value="at">指定过期时间</option>
          </select>
          {expiryMode === "at" && (
            <input
              className="h-9 min-w-0 border border-gray-200 rounded px-2 text-sm"
              type="datetime-local"
              value={expiresAtLocal}
              onChange={(e) => setExpiresAtLocal(e.target.value)}
            />
          )}
          <Button onClick={addKey} className="h-9 whitespace-nowrap">
            <KeyRound size={15} className="mr-1" /> 添加
          </Button>
        </div>

        <div className="space-y-2">
          {keys.length === 0 && (
            <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded p-3">
              暂无密钥，当前 MCP Gateway 不需要鉴权。添加密钥后，外部客户端必须携带有效密钥。
            </div>
          )}
          {keys.map((entry) => (
            <div key={entry.id} className="border border-gray-200 rounded p-2 flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(e) => {
                    const next = keys.map((item) => item.id === entry.id ? { ...item, enabled: e.target.checked } : item);
                    saveKeys(next);
                  }}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  <span>{entry.name}</span>
                  <span className={`text-[11px] ${isActiveKey(entry) ? "text-emerald-600" : "text-gray-400"}`}>
                    {keyStateLabel(entry)}
                  </span>
                </div>
                <div className="text-xs font-mono text-gray-500 truncate">{entry.key}</div>
                <div className="text-[11px] text-gray-400">{expiryLabel(entry)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => copy(entry.key, "密钥")} title="复制密钥">
                <Copy size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => copy(configForKey(httpUrl, entry.key), "客户端配置")} title="复制客户端配置">
                <ExternalLink size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => saveKeys(keys.filter((item) => item.id !== entry.id))}
                title="删除密钥"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <ConfigBlock
        title="Codex 流式 HTTP 配置"
        value={codexToml}
        onCopy={() => copy(codexToml, "Codex 配置")}
      />

      <ConfigBlock
        title="Claude Code / Kimi / GitHub Copilot / IDE 流式 HTTP 配置"
        value={httpConfig}
        onCopy={() => copy(httpConfig, "HTTP 配置")}
      />

      {status?.running && (
        <a
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          href={status.url || httpUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} /> 打开 MCP 网关信息
        </a>
      )}
    </div>
  );
}

function ConfigBlock({ title, value, onCopy }: { title: string; value: string; onCopy: () => void }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-gray-700">{title}</div>
        <Button variant="ghost" size="sm" onClick={onCopy} title="复制">
          <Copy size={14} />
        </Button>
      </div>
      <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 max-h-56 overflow-auto bg-white">
        {value}
      </pre>
    </div>
  );
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `cs_mcp_${encoded}`;
}

function isActiveKey(entry: McpGatewayKey) {
  if (!entry.enabled || !entry.key.trim()) return false;
  if (!entry.expiresAt) return true;
  return new Date(entry.expiresAt).getTime() > Date.now();
}

function keyStateLabel(entry: McpGatewayKey) {
  if (!entry.enabled) return "已停用";
  if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) return "已过期";
  return "可用";
}

function expiryLabel(entry: McpGatewayKey) {
  if (!entry.expiresAt) return "永久有效";
  return `过期时间：${new Date(entry.expiresAt).toLocaleString()}`;
}

function localDateToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
  return date.toISOString();
}

function configForKey(url: string, key: string) {
  return JSON.stringify({
    mcpServers: {
      "codeshelf-api": {
        url,
        headers: {
          Authorization: `Bearer ${key}`,
        },
      },
    },
  }, null, 2);
}
