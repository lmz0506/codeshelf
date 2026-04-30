import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Copy, ExternalLink, Play, RefreshCw, Server, Square, XCircle } from "lucide-react";
import { Button, showToast } from "@/components/ui";

interface McpGatewayStatus {
  running: boolean;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  startedAt?: string | null;
}

interface AppSettings {
  mcp_gateway_enabled?: boolean;
  mcp_gateway_host?: string;
  mcp_gateway_port?: number;
}

export function McpGatewaySettings() {
  const [status, setStatus] = useState<McpGatewayStatus | null>(null);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("8787");
  const [busy, setBusy] = useState(false);

  async function refresh(loadSavedSettings = false) {
    try {
      if (loadSavedSettings) {
        const settings = await invoke<AppSettings>("get_app_settings");
        setHost(settings.mcp_gateway_host || "127.0.0.1");
        setPort(String(settings.mcp_gateway_port || 8787));
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

  async function startGateway() {
    const parsedPort = Number(port);
    if (!host.trim() || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      showToast("warning", "请填写有效的监听地址和端口");
      return;
    }
    setBusy(true);
    try {
      await invoke<AppSettings>("save_app_settings", {
        input: {
          mcp_gateway_enabled: true,
          mcp_gateway_host: host.trim(),
          mcp_gateway_port: parsedPort,
        },
      });
      const next = await invoke<McpGatewayStatus>("mcp_gateway_status");
      setStatus(next);
      showToast("success", `MCP Gateway 已在 ${host.trim()}:${parsedPort} 启动`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "启动 MCP HTTP 网关失败");
    } finally {
      setBusy(false);
    }
  }

  async function stopGateway() {
    setBusy(true);
    try {
      await invoke<AppSettings>("save_app_settings", {
        input: {
          mcp_gateway_enabled: false,
          mcp_gateway_host: host.trim() || "127.0.0.1",
          mcp_gateway_port: Number(port) || 8787,
        },
      });
      const next = await invoke<McpGatewayStatus>("mcp_gateway_status");
      setStatus(next);
      showToast("success", "MCP Gateway 已停止");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "停止 MCP HTTP 网关失败");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", `${label}已复制`);
    } catch {
      showToast("error", "复制失败");
    }
  }

  const httpUrl = status?.url || `http://${host || "127.0.0.1"}:${port || "8787"}/mcp`;
  const httpConfig = JSON.stringify({
    mcpServers: {
      "codeshelf-api": {
        url: httpUrl,
      },
    },
  }, null, 2);
  const codexToml = `[mcp_servers.codeshelf-api]\nurl = "${httpUrl}"`;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Server size={18} /> MCP Gateway
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          内置在 CodeShelf 面板里的 MCP HTTP 网关。端口在这里配置，外部工具通过这个地址调用接口库 tools。
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            {status?.running
              ? <CheckCircle2 size={16} className="text-emerald-500" />
              : <XCircle size={16} className="text-gray-400" />}
            {status?.running ? "HTTP 网关运行中" : "HTTP 网关未启动"}
          </div>
          <div className="text-xs text-gray-500 font-mono mt-1 break-all">
            {status?.running ? status.url : "网关由 CodeShelf 面板控制，启动后外部 MCP 客户端连接这里。"}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refresh()} disabled={busy} title="刷新状态">
          <RefreshCw size={15} />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px] gap-2 items-end">
        <label className="block text-xs text-gray-700">
          监听地址
          <input
            className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-sm font-mono"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </label>
        <label className="block text-xs text-gray-700">
          端口
          <input
            className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-sm font-mono"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </label>
        {status?.running ? (
          <Button variant="danger" onClick={stopGateway} disabled={busy}>
            <Square size={15} className="mr-1" /> 停止
          </Button>
        ) : (
          <Button onClick={startGateway} disabled={busy}>
            <Play size={15} className="mr-1" /> 启动
          </Button>
        )}
      </div>

      <ConfigBlock
        title="Codex HTTP 配置"
        value={codexToml}
        onCopy={() => copy(codexToml, "Codex 配置")}
      />

      <ConfigBlock
        title="Claude Code / Kimi / GitHub Copilot / IDE HTTP 配置"
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
