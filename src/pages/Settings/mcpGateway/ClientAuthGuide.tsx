import { Info } from "lucide-react";

/**
 * 帮助用户在 Codex / Claude Desktop / Cline 等客户端正确配置鉴权。
 * 重点：很多客户端会在二次 POST 请求中丢弃 URL 上的 ?key= 查询参数，
 * 这就是 server 报 receivedKey: false 的最常见原因。
 */
export function ClientAuthGuide() {
  return (
    <div className="border border-blue-200 bg-blue-50/60 rounded-lg p-3 text-xs leading-relaxed text-blue-900/90 space-y-2">
      <div className="flex items-center gap-1.5 font-semibold text-blue-700">
        <Info size={14} /> 客户端配置提示
      </div>
      <p>
        优先使用 <code className="px-1 rounded bg-white/70 font-mono">Authorization: Bearer &lt;key&gt;</code> 标头鉴权。
        许多 MCP 客户端（包括 Codex、Claude Desktop 旧版本）只在第一次握手时使用 URL 中的 <code className="px-1 rounded bg-white/70 font-mono">?key=</code> 查询参数，
        后续 JSON-RPC 请求会丢掉它，于是后端就会看到 <code className="px-1 rounded bg-white/70 font-mono">receivedKey: false</code>。
      </p>
      <p className="text-blue-900">
        <span className="font-semibold">Codex 配置法（推荐）：</span>
        <span className="block ml-3 mt-1 space-y-0.5">
          <span className="block"><code className="font-mono">URL</code>：<code className="font-mono">http://&lt;host&gt;:&lt;port&gt;/mcp</code>（不带任何 query）</span>
          <span className="block"><code className="font-mono">标头键</code>：<code className="font-mono">Authorization</code></span>
          <span className="block"><code className="font-mono">标头值</code>：<code className="font-mono">Bearer cs_mcp_xxxxxxxx…</code></span>
        </span>
      </p>
      <p>
        或者用「Bearer 令牌环境变量」：先把 <code className="font-mono">MCP_BEARER_TOKEN=cs_mcp_…</code> 放到 shell/系统环境变量，
        再在 Codex 的「Bearer 令牌环境变量」里填 <code className="font-mono">MCP_BEARER_TOKEN</code>。
      </p>
      <p className="text-blue-700/80">
        服务端同时支持 <code className="font-mono">x-api-key</code> / <code className="font-mono">x-mcp-key</code> /
        <code className="font-mono">mcp-bearer-token</code> 标头，以及 <code className="font-mono">?key=</code> /
        <code className="font-mono">?token=</code> 查询参数；只在客户端确实不能改标头时才退回到查询参数方案。
      </p>
    </div>
  );
}
