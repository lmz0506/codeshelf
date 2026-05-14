import type { ChatStreamMessage, ChatStreamRequest } from "@/services/chat";
import type { ToolCallAccumulated, StreamCallbacks } from "@/pages/Chat/hooks/useChatStream";
import { mcpClient, type McpCallResult } from "./client";

export const MAX_TOOL_ROUNDS = 10;

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
  }) => Promise<void> | void;
  /** 一个 tool_call 执行完成 */
  onToolExecuted?: (turn: {
    call: ToolCallSummary;
    result: ToolDispatchResult;
  }) => Promise<void> | void;
  onError?: (msg: string) => void;
  maxRounds?: number;
}

function streamOnce(
  startStream: StartStreamFn,
  request: Omit<ChatStreamRequest, "requestId">,
  onDelta?: (full: string, thinking: string) => void,
): Promise<{ content: string; thinking: string; toolCalls: ToolCallAccumulated[]; finishReason?: string }> {
  return new Promise((resolve, reject) => {
    startStream(request, {
      onDelta: (full, thinking) => onDelta?.(full, thinking),
      onThinking: () => {},
      onToolCallDelta: () => {},
      onDone: (content, thinking, toolCalls, finishReason) =>
        resolve({ content, thinking, toolCalls, finishReason }),
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
    } catch (err) {
      opts.onError?.(err instanceof Error ? err.message : String(err));
      return;
    }

    const callSummaries: ToolCallSummary[] = turn.toolCalls
      .filter((c) => c.id || c.name)
      .map((c) => ({ id: c.id, name: c.name, arguments: c.arguments || "{}" }));

    await opts.onAssistantFinal?.({
      content: turn.content,
      thinking: turn.thinking,
      toolCalls: callSummaries,
      finishReason: turn.finishReason,
    });

    messages = [
      ...messages,
      {
        role: "assistant",
        content: turn.content,
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

    for (const call of callSummaries) {
      let result: ToolDispatchResult;
      try {
        result = await opts.dispatch(call);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = { content: `执行失败: ${msg}`, isError: true, errorMessage: msg };
      }
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
