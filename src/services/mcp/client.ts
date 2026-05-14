import { invoke } from "@tauri-apps/api/core";

const JSONRPC_VERSION = "2.0";
const PROTOCOL_VERSION = "2024-11-05";
const REQUEST_TIMEOUT_MS = 5000;

export interface McpGatewayInternalEndpoint {
  url: string;
  apiKey: string | null;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: object;
  annotations?: Record<string, unknown>;
  _meta?: {
    codeshelfEndpointId?: string;
    codeshelfLegacyName?: string;
    method?: string;
    url?: string;
    [key: string]: unknown;
  };
}

export interface McpCallContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpCallResult {
  content: McpCallContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * 把项目里跟 AI 有关的功能统一成 MCP 客户端：
 * - 走本地 MCP gateway HTTP（127.0.0.1:port/mcp）
 * - gateway 未启动时 isAvailable() 返回 false，调用方应跳过工具调用
 * - mcp_gateway_keys 为空时 gateway 不鉴权，自动跳过 Authorization 头
 */
class McpGatewayClient {
  private endpoint: McpGatewayInternalEndpoint | null = null;
  private endpointLoadedAt = 0;
  private initialized = false;
  private nextId = 1;

  async refresh(): Promise<void> {
    const next = await invoke<McpGatewayInternalEndpoint | null>("mcp_gateway_internal_endpoint");
    if (this.endpoint && next && this.endpoint.url !== next.url) {
      this.initialized = false;
    }
    if (!next) {
      this.initialized = false;
    }
    this.endpoint = next;
    this.endpointLoadedAt = Date.now();
  }

  private async getEndpoint(force = false): Promise<McpGatewayInternalEndpoint | null> {
    if (force || this.endpoint === null || Date.now() - this.endpointLoadedAt > 2000) {
      await this.refresh();
    }
    return this.endpoint;
  }

  async isAvailable(): Promise<boolean> {
    const ep = await this.getEndpoint();
    return ep !== null;
  }

  private async send<T = unknown>(method: string, params?: unknown): Promise<T> {
    const ep = await this.getEndpoint();
    if (!ep) {
      throw new Error("MCP Gateway 未启动，请先在设置中开启");
    }
    const id = this.nextId++;
    const body = { jsonrpc: JSONRPC_VERSION, id, method, params };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ep.apiKey) headers["Authorization"] = `Bearer ${ep.apiKey}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let resp: Response;
    try {
      // ep.url 已是完整端点（来自 mcp_gateway_status，形如 http://host:port/mcp），直接 POST
      resp = await fetch(ep.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new Error(
        err instanceof DOMException && err.name === "AbortError"
          ? `MCP Gateway 请求超时 (${REQUEST_TIMEOUT_MS}ms)`
          : `MCP Gateway 请求失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`MCP Gateway HTTP ${resp.status}: ${text || resp.statusText}`);
    }
    const data = (await resp.json()) as JsonRpcResponse<T>;
    if (data.error) {
      throw new Error(`MCP Gateway 错误 (${data.error.code}): ${data.error.message}`);
    }
    return data.result as T;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "codeshelf", version: "0.1.26" },
    });
    this.initialized = true;
  }

  async listTools(filter?: { endpointIds?: string[] }): Promise<McpTool[]> {
    await this.initialize();
    const res = await this.send<{ tools: McpTool[] }>("tools/list");
    const tools = res.tools ?? [];
    if (!filter?.endpointIds || filter.endpointIds.length === 0) return tools;
    const allowed = new Set(filter.endpointIds);
    return tools.filter((t) => {
      const id = t._meta?.codeshelfEndpointId;
      return typeof id === "string" && allowed.has(id);
    });
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    await this.initialize();
    return this.send<McpCallResult>("tools/call", { name, arguments: args ?? {} });
  }
}

export const mcpClient = new McpGatewayClient();
