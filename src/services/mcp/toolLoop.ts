import type { ChatStreamMessage, ChatStreamRequest } from "@/services/chat";
import type { ToolCallAccumulated, StreamCallbacks, TokenUsage } from "@/pages/Chat/hooks/useChatStream";
import { buildApiTools, executeApiEndpoint, type ApiExecutionResult } from "@/services/api_chat";
import { mcpClient, type McpCallResult } from "./client";

export const MAX_TOOL_ROUNDS = 10;
export const MAX_STREAM_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 是否为可重试的瞬时流式错误。
 * - 明确不重试：达到上限 / 4xx / 鉴权失败（重试也没用）
 * - 重试：网络/超时/5xx/读流失败等
 */
function isTransientStreamError(msg: string): boolean {
  if (/已达最大|401|403|无效\s*API|API\s*Key|HTTP\s*4\d\d/i.test(msg)) return false;
  return /请求失败|读取流失败|读取响应失败|timeout|超时|HTTP\s*5\d\d|network|ECONN|reset|EOF|fetch/i.test(
    msg,
  );
}

export interface ToolLoopProvider {
  providerId: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  thinking?: boolean;
}

export interface ToolLoopGeneration {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface FunctionTool {
  type: "function";
  function: { name: string; description?: string; parameters: object };
}

export interface ToolDispatchResult {
  /** 给 LLM 看的文本内容（必填，会作为 role:"tool" 消息体） */
  content: string;
  /** 原始结构化内容，UI 层可平铺到 ChatMessage 的扩展字段 */
  structuredContent?: unknown;
  isError?: boolean;
  /** dispatch 内部识别失败时填写，用于上层 onError 提示 */
  errorMessage?: string;
}

export interface ToolCallSummary {
  id: string;
  name: string;
  arguments: string;
}

export type StartStreamFn = (
  request: Omit<ChatStreamRequest, "requestId">,
  callbacks: StreamCallbacks,
) => Promise<string>;

export interface ToolLoopOptions {
  startStream: StartStreamFn;
  provider: ToolLoopProvider;
  generation?: ToolLoopGeneration;
  initialMessages: ChatStreamMessage[];
  /** 返回 OpenAI function-calling 兼容的工具数组；返回空表示不带工具调 LLM */
  toolsBuilder: () => Promise<FunctionTool[]>;
  /** 路由每个 tool_call。LLM 给出的 arguments 是字符串（JSON），由 dispatch 自行解析 */
  dispatch: (call: ToolCallSummary) => Promise<ToolDispatchResult>;
  /** 流增量更新 */
  onAssistantDelta?: (fullContent: string, fullThinking: string) => void;
  /** 当前轮 assistant 完成（含可能的 tool_calls）。调用方应把它持久化到自己的会话 */
  onAssistantFinal?: (turn: {
    content: string;
    thinking: string;
    toolCalls: ToolCallSummary[];
    finishReason?: string;
    usage?: TokenUsage;
  }) => Promise<void> | void;
  /** 一个 tool_call 执行完成 */
  onToolExecuted?: (turn: {
    call: ToolCallSummary;
    result: ToolDispatchResult;
  }) => Promise<void> | void;
  onError?: (msg: string) => void;
  /** 单个 tool_call 即将派发（UI 据此显示"调用中…"占位气泡） */
  onToolStart?: (info: { call: ToolCallSummary }) => void;
  /** 流式请求瞬时失败、即将重试时回调 */
  onRetry?: (info: { round: number; attempt: number; error: string }) => void;
  maxRounds?: number;
  /** 单轮流式请求最大重试次数（仅瞬时错误），默认 MAX_STREAM_RETRIES */
  maxStreamRetries?: number;
}

function streamOnce(
  startStream: StartStreamFn,
  request: Omit<ChatStreamRequest, "requestId">,
  onDelta?: (full: string, thinking: string) => void,
): Promise<{
  content: string;
  thinking: string;
  toolCalls: ToolCallAccumulated[];
  finishReason?: string;
  usage?: TokenUsage;
}> {
  return new Promise((resolve, reject) => {
    startStream(request, {
      onDelta: (full, thinking) => onDelta?.(full, thinking),
      onThinking: () => {},
      onToolCallDelta: () => {},
      onDone: (content, thinking, toolCalls, finishReason, usage) =>
        resolve({ content, thinking, toolCalls, finishReason, usage }),
      onError: (msg) => reject(new Error(msg)),
    }).catch((err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/**
 * 通用工具循环：把对话 + 工具 + LLM stream + 工具派发组合起来。
 * - 由调用方提供 toolsBuilder 和 dispatch，因此既能跑 MCP-only（ApiChat）也能跑混合派发（助手 Chat）
 * - 一旦 LLM 不再返回 tool_calls 就退出
 * - 单次工具执行失败不中断循环，会把错误文本作为 tool 消息塞回，让 LLM 自行处理
 */
export async function runToolLoop(opts: ToolLoopOptions): Promise<void> {
  const maxRounds = opts.maxRounds ?? MAX_TOOL_ROUNDS;
  let messages = [...opts.initialMessages];

  for (let round = 0; round < maxRounds; round++) {
    const tools = await opts.toolsBuilder();
    let turn;
    {
      const maxStreamRetries = opts.maxStreamRetries ?? MAX_STREAM_RETRIES;
      let attempt = 0;
      for (;;) {
        try {
          turn = await streamOnce(
            opts.startStream,
            {
              providerId: opts.provider.providerId,
              model: opts.provider.model,
              baseUrl: opts.provider.baseUrl,
              apiKey: opts.provider.apiKey,
              thinking: opts.provider.thinking,
              stream: true,
              temperature: opts.generation?.temperature,
              maxTokens: opts.generation?.maxTokens,
              topP: opts.generation?.topP,
              frequencyPenalty: opts.generation?.frequencyPenalty,
              presencePenalty: opts.generation?.presencePenalty,
              messages,
              tools: tools.length > 0 ? tools : undefined,
            },
            opts.onAssistantDelta,
          );
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt < maxStreamRetries && isTransientStreamError(msg)) {
            attempt++;
            opts.onRetry?.({ round, attempt, error: msg });
            // streamOnce 失败时 onAssistantDelta 尚未产出有效内容，重试会从空缓冲重放，安全
            await sleep(500 * 2 ** (attempt - 1));
            continue;
          }
          opts.onError?.(msg);
          return;
        }
      }
    }

    const callSummaries: ToolCallSummary[] = turn.toolCalls
      .filter((c) => c.id || c.name)
      .map((c) => ({ id: c.id, name: c.name, arguments: c.arguments || "{}" }));

    await opts.onAssistantFinal?.({
      content: turn.content,
      thinking: turn.thinking,
      toolCalls: callSummaries,
      finishReason: turn.finishReason,
      usage: turn.usage,
    });

    messages = [
      ...messages,
      {
        role: "assistant",
        content: turn.content,
        thinkingContent: turn.thinking || undefined,
        toolCalls:
          callSummaries.length > 0
            ? callSummaries.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: c.arguments },
              }))
            : undefined,
      },
    ];

    if (turn.finishReason !== "tool_calls" || callSummaries.length === 0) {
      return;
    }

    // 并行派发本轮所有 tool_call；结果按原索引装配，保证与 tool_calls 顺序对齐
    const results = await Promise.all(
      callSummaries.map(async (call): Promise<ToolDispatchResult> => {
        opts.onToolStart?.({ call });
        try {
          return await opts.dispatch(call);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: `执行失败: ${msg}`, isError: true, errorMessage: msg };
        }
      }),
    );
    for (let i = 0; i < callSummaries.length; i++) {
      const call = callSummaries[i];
      const result = results[i];
      messages = [
        ...messages,
        {
          role: "tool",
          content: result.content,
          toolCallId: call.id,
          name: call.name,
        },
      ];
      await opts.onToolExecuted?.({ call, result });
    }
  }

  opts.onError?.(`已达最大工具循环轮次 ${maxRounds}`);
}

/* ============ MCP gateway 派发 / 工具构建 helper ============ */

export interface ApiToolMetadata {
  status?: number;
  method?: string;
  url?: string;
  elapsedMs?: number;
  totalBytes?: number;
  truncated?: boolean;
  body?: string;
}

/**
 * MCP gateway 的 `tools/call` 响应在 structuredContent 里完整保留了 ApiExecutionResult。
 * 这个 helper 把它平铺成 ChatMessage 上要显示的元数据字段，避免 ApiChat 显示回归。
 */
export function extractApiToolMetadata(structured: unknown): ApiToolMetadata | null {
  if (!structured || typeof structured !== "object") return null;
  const s = structured as Record<string, unknown>;
  const meta: ApiToolMetadata = {};
  if (typeof s.status === "number") meta.status = s.status;
  if (typeof s.method === "string") meta.method = s.method;
  if (typeof s.url === "string") meta.url = s.url;
  if (typeof s.elapsedMs === "number") meta.elapsedMs = s.elapsedMs;
  if (typeof s.totalBytes === "number") meta.totalBytes = s.totalBytes;
  if (typeof s.truncated === "boolean") meta.truncated = s.truncated;
  if (typeof s.body === "string") meta.body = s.body;
  return Object.keys(meta).length > 0 ? meta : null;
}

/** 把 MCP tools 列表转换成 OpenAI function-calling 兼容的 schema */
export async function buildMcpFunctionTools(filter?: { endpointIds?: string[] }): Promise<FunctionTool[]> {
  if (!(await mcpClient.isAvailable())) return [];
  const tools = await mcpClient.listTools(filter);
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema,
    },
  }));
}

/** 通过 MCP gateway 派发 tool_call（默认派发器） */
export async function dispatchViaMcp(call: ToolCallSummary): Promise<ToolDispatchResult> {
  let args: unknown = {};
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    args = {};
  }
  let res: McpCallResult;
  try {
    res = await mcpClient.callTool(call.name, args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `执行失败: ${msg}`, isError: true, errorMessage: msg };
  }
  const text = res.content?.[0]?.text ?? "";
  return {
    content: text || (res.isError ? "MCP 工具执行错误" : "无内容"),
    structuredContent: res.structuredContent,
    isError: res.isError === true,
  };
}

/* ============ 直连后端派发（MCP gateway 不可用时的兜底） ============ */

/**
 * 直连后端构建工具 + 派发器。工具名为 `ep_<id>`（与 useMcpEndpointLookup 的回退解析一致），
 * 派发结果的 structuredContent 即 ApiExecutionResult —— extractApiToolMetadata 能原样解析，
 * 因此 UI 渲染与走 MCP gateway 完全一致。
 */
export async function buildDirectTools(endpointIds: string[]): Promise<{
  tools: FunctionTool[];
  dispatch: (call: ToolCallSummary) => Promise<ToolDispatchResult>;
}> {
  const bundle = await buildApiTools(endpointIds);
  const tools = bundle.tools as FunctionTool[];
  const nameMap = bundle.toolNameMap;
  const dispatch = async (call: ToolCallSummary): Promise<ToolDispatchResult> => {
    const endpointId = nameMap[call.name];
    if (!endpointId) {
      const msg = `未找到工具对应的接口: ${call.name}`;
      return { content: `执行失败: ${msg}`, isError: true, errorMessage: msg };
    }
    let r: ApiExecutionResult;
    try {
      r = await executeApiEndpoint(endpointId, call.arguments || "{}");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `执行失败: ${msg}`, isError: true, errorMessage: msg };
    }
    return {
      content: r.body ? `HTTP ${r.status}\n\n${r.body}` : `HTTP ${r.status}`,
      structuredContent: r,
      isError: r.status >= 400,
    };
  };
  return { tools, dispatch };
}
