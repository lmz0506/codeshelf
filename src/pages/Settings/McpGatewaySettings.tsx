import { useMemo } from "react";
import { ExternalLink, Server } from "lucide-react";
import { showToast } from "@/components/ui";
import {
  ConfigBlock,
  GatewayListenerForm,
  GatewayStatusCard,
  KeyManagerSection,
  SecurityNotice,
  configForKey,
  isActiveKey,
  useMcpGateway,
} from "./mcpGateway";

/**
 * MCP Gateway 设置页面（顶层编排）：
 * - 业务状态由 useMcpGateway hook 管理；本组件只负责把数据派发给各小组件，
 *   并在启停时做必要的二次确认（鉴权风险、活动密钥被切断等）。
 * - 各 UI 块都拆到 ./mcpGateway 子目录，便于独立维护与测试。
 */
export function McpGatewaySettings() {
  const {
    status, host, setHost, port, setPort, keys, busy,
    refresh, startGateway, stopGateway, saveKeys,
  } = useMcpGateway();

  const activeKeys = useMemo(() => keys.filter(isActiveKey), [keys]);
  const exampleKey = activeKeys[0]?.key || "YOUR_MCP_KEY";
  const httpUrl = status?.url || `http://${host || "127.0.0.1"}:${port || "8787"}/mcp`;
  const queryUrl = `${httpUrl}?key=${encodeURIComponent(exampleKey)}`;
  const httpConfig = useMemo(() => configForKey(httpUrl, exampleKey), [httpUrl, exampleKey]);
  const codexToml = `[mcp_servers.codeshelf-api]\nurl = "${queryUrl}"`;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", `${label}已复制`);
    } catch {
      showToast("error", "复制失败");
    }
  }

  async function handleStart() {
    if (activeKeys.length === 0) {
      const proceed = confirm(
        "当前没有任何可用密钥，启动后任何能访问到端口的客户端都能调用 /mcp。\n\n建议先添加并启用至少一条密钥再启动，仍要继续吗？",
      );
      if (!proceed) return;
    }
    await startGateway();
  }

  async function handleStop() {
    if (status?.running && activeKeys.length > 0) {
      const proceed = confirm(
        `确认停止 MCP Gateway 吗？\n\n当前有 ${activeKeys.length} 条可用密钥，所有正在使用网关的客户端会立即断开。`,
      );
      if (!proceed) return;
    }
    await stopGateway();
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

      <GatewayStatusCard
        status={status}
        fallbackUrl={httpUrl}
        busy={busy}
        onRefresh={() => refresh(true)}
        onCopy={(url) => copy(url, "网关地址")}
      />

      <SecurityNotice status={status} host={host} keys={keys} />

      <GatewayListenerForm
        host={host}
        port={port}
        running={!!status?.running}
        busy={busy}
        onHostChange={setHost}
        onPortChange={setPort}
        onStart={handleStart}
        onStop={handleStop}
      />

      <KeyManagerSection
        keys={keys}
        httpUrl={httpUrl}
        onSaveKeys={saveKeys}
        onCopy={copy}
      />

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
