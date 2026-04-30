import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  httpUrl: string;
  /** 当前可用的第一条密钥；没有可用密钥时为 null。 */
  activeKey: string | null;
  onCopy: (text: string, label: string) => void;
}

type ExampleId =
  | "curl"
  | "httpie"
  | "fetch"
  | "python"
  | "claude-code"
  | "codex"
  | "cline"
  | "query";

interface Example {
  id: ExampleId;
  label: string;
  /** 简要说明，比如「使用 Authorization 标头(推荐)」。 */
  hint: string;
  /** 代码语言，仅用于 UI 显示。 */
  language: string;
  build: (url: string, key: string) => string;
}

/**
 * 「使用示例」面板：
 * - 默认全部使用 Authorization: Bearer 标头鉴权（适配几乎所有 HTTP MCP 客户端）
 * - 提供一份 query 鉴权示例，仅用于无法添加自定义标头的客户端
 * - 没有可用密钥时显示占位 <YOUR_KEY> 让用户也能预览结构
 */
export function KeyUsageExamples({ httpUrl, activeKey, onCopy }: Props) {
  const [tab, setTab] = useState<ExampleId>("curl");
  const key = activeKey || "<YOUR_MCP_KEY>";

  const examples = useMemo<Example[]>(() => [
    {
      id: "curl",
      label: "curl",
      hint: "Bearer 标头",
      language: "bash",
      build: (url, k) => [
        `curl -X POST "${url}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Authorization: Bearer ${k}" \\`,
        `  -d '{`,
        `    "jsonrpc": "2.0",`,
        `    "id": 1,`,
        `    "method": "tools/list"`,
        `  }'`,
      ].join("\n"),
    },
    {
      id: "httpie",
      label: "HTTPie",
      hint: "Bearer 标头",
      language: "bash",
      build: (url, k) =>
        `http POST ${url} \\\n  Authorization:"Bearer ${k}" \\\n  jsonrpc=2.0 id:=1 method=tools/list`,
    },
    {
      id: "fetch",
      label: "Node / Web fetch",
      hint: "Bearer 标头",
      language: "javascript",
      build: (url, k) => [
        `const res = await fetch("${url}", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    "Content-Type": "application/json",`,
        `    Authorization: \`Bearer ${k}\`,`,
        `  },`,
        `  body: JSON.stringify({`,
        `    jsonrpc: "2.0",`,
        `    id: 1,`,
        `    method: "tools/list",`,
        `  }),`,
        `});`,
        `console.log(await res.json());`,
      ].join("\n"),
    },
    {
      id: "python",
      label: "Python httpx",
      hint: "Bearer 标头",
      language: "python",
      build: (url, k) => [
        `import httpx`,
        ``,
        `resp = httpx.post(`,
        `    "${url}",`,
        `    headers={"Authorization": f"Bearer ${k}"},`,
        `    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},`,
        `    timeout=30,`,
        `)`,
        `print(resp.json())`,
      ].join("\n"),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      hint: "~/.claude.json mcpServers 段",
      language: "json",
      build: (url, k) => JSON.stringify(
        {
          mcpServers: {
            "codeshelf-api": {
              type: "http",
              url,
              headers: { Authorization: `Bearer ${k}` },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: "codex",
      label: "Codex (TOML)",
      hint: "~/.codex/config.toml 标头鉴权",
      language: "toml",
      build: (url, k) => [
        `[mcp_servers.codeshelf-api]`,
        `url = "${url}"`,
        ``,
        `[mcp_servers.codeshelf-api.headers]`,
        `Authorization = "Bearer ${k}"`,
      ].join("\n"),
    },
    {
      id: "cline",
      label: "Cline / Cursor",
      hint: "settings.json mcpServers 段",
      language: "json",
      build: (url, k) => JSON.stringify(
        {
          mcpServers: {
            "codeshelf-api": {
              transport: "http",
              url,
              headers: { Authorization: `Bearer ${k}` },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: "query",
      label: "Query 鉴权（兼容用）",
      hint: "客户端不支持自定义标头时退而求其次",
      language: "bash",
      build: (url, k) => [
        `# 注意：很多客户端会在后续 JSON-RPC POST 中丢失 ?key=，`,
        `# 此时服务器返回 receivedKey: false。优先用 Bearer 标头。`,
        `curl -X POST "${url}?key=${encodeURIComponent(k)}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
      ].join("\n"),
    },
  ], []);

  const current = examples.find((ex) => ex.id === tab) || examples[0];
  const code = current.build(httpUrl, key);

  return (
    <section className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-semibold text-gray-700">使用示例</div>
          <span className="text-[11px] text-gray-500">{current.hint}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onCopy(code, `${current.label} 示例`)} title="复制">
          <Copy size={14} />
        </Button>
      </div>

      <div className="px-3 pt-2 flex items-center gap-1 flex-wrap text-xs">
        {examples.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => setTab(ex.id)}
            className={`px-2 py-1 rounded border transition-colors ${
              tab === ex.id
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {!activeKey && (
        <div className="mx-3 mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          当前没有可用密钥，示例里的 <code className="font-mono">&lt;YOUR_MCP_KEY&gt;</code> 仅用于占位，请先生成并启用一条密钥。
        </div>
      )}

      <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 max-h-72 overflow-auto bg-white">
        {code}
      </pre>
    </section>
  );
}
