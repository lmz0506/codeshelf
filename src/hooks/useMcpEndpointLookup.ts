import { useCallback, useEffect, useState } from "react";
import { listApiEndpoints } from "@/services/api_chat";
import { mcpClient } from "@/services/mcp/client";
import type { ApiEndpoint } from "@/types";

export interface EndpointMeta {
  method: string;
  url: string;
  name?: string;
}

/** 与 src-tauri/src/commands/api_chat.rs::sanitize_tool_name / mcp_gateway::legacy_endpoint_tool_name 一致 */
function sanitizeToolName(endpointId: string): string {
  const raw = `ep_${endpointId}`;
  const cleaned = Array.from(raw)
    .map((c) => (/[A-Za-z0-9_\-]/.test(c) ? c : "_"))
    .join("");
  return cleaned.length <= 60 ? cleaned : cleaned.slice(0, 60);
}

/**
 * 把 LLM 看到的 tool name 反解为 endpoint 元信息（METHOD/URL/名称），用于 ToolCallBubble 显示。
 * 同时兼容两种命名：
 * - 旧 ep_<id>：直接命中
 * - MCP gateway 现代名 api_<method>_<path>_<hash>：通过 mcpClient.listTools 拿到 _meta.codeshelfEndpointId 再反查
 *
 * @param endpointsArg 调用方已经维护了 endpoints 列表时传入，避免重复请求；不传则 hook 内部 listApiEndpoints
 */
export function useMcpEndpointLookup(endpointsArg?: ApiEndpoint[]): (toolName: string) => EndpointMeta | null {
  const [internalEndpoints, setInternalEndpoints] = useState<ApiEndpoint[]>([]);
  const endpoints = endpointsArg ?? internalEndpoints;
  const [toolNameToEpId, setToolNameToEpId] = useState<Map<string, string>>(new Map());

  // 调用方未提供 endpoints 时自行拉一次
  useEffect(() => {
    if (endpointsArg) return;
    let cancelled = false;
    (async () => {
      try {
        const eps = await listApiEndpoints();
        if (!cancelled) setInternalEndpoints(eps);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpointsArg]);

  // endpoints 变化时拉一次 MCP tool name → endpointId 映射
  useEffect(() => {
    if (endpoints.length === 0) {
      setToolNameToEpId(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!(await mcpClient.isAvailable())) return;
        const tools = await mcpClient.listTools();
        const m = new Map<string, string>();
        for (const t of tools) {
          const epId = t._meta?.codeshelfEndpointId;
          if (typeof epId === "string") m.set(t.name, epId);
        }
        if (!cancelled) setToolNameToEpId(m);
      } catch {
        /* gateway 未启动或别的异常都不影响主流程 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoints]);

  return useCallback(
    (toolName: string) => {
      for (const ep of endpoints) {
        if (sanitizeToolName(ep.id) === toolName) {
          return { method: ep.method, url: ep.url, name: ep.name };
        }
      }
      const epId = toolNameToEpId.get(toolName);
      if (epId) {
        const ep = endpoints.find((e) => e.id === epId);
        if (ep) return { method: ep.method, url: ep.url, name: ep.name };
      }
      return null;
    },
    [endpoints, toolNameToEpId],
  );
}
