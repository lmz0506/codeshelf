import { invoke } from "@tauri-apps/api/core";
import type {
  ApiChatSession,
  ApiChatSessionSummary,
  ApiEndpoint,
  ApiGroup,
} from "@/types";

export interface CreateApiChatSessionInput {
  title?: string;
  providerId: string;
  modelId: string;
  selectedEndpointIds?: string[];
}

export interface ApiToolsBundle {
  tools: Array<{
    type: "function";
    function: { name: string; description?: string; parameters: object };
  }>;
  toolNameMap: Record<string, string>;
}

export interface ApiExecutionResult {
  status: number;
  method: string;
  url: string;
  elapsedMs: number;
  totalBytes: number;
  truncated: boolean;
  body: string;
}

// ---------- Group ----------
export async function listApiGroups(): Promise<ApiGroup[]> {
  return invoke("list_api_groups");
}
export async function saveApiGroup(group: ApiGroup): Promise<ApiGroup> {
  return invoke("save_api_group", { group });
}
export async function deleteApiGroup(id: string): Promise<void> {
  return invoke("delete_api_group", { id });
}

// ---------- Endpoint ----------
export async function listApiEndpoints(): Promise<ApiEndpoint[]> {
  return invoke("list_api_endpoints");
}
export async function saveApiEndpoint(endpoint: ApiEndpoint): Promise<ApiEndpoint> {
  return invoke("save_api_endpoint", { endpoint });
}
export async function deleteApiEndpoint(id: string): Promise<void> {
  return invoke("delete_api_endpoint", { id });
}

// ---------- Session ----------
export async function listApiChatSessions(): Promise<ApiChatSessionSummary[]> {
  return invoke("list_api_chat_sessions");
}
export async function getApiChatSession(sessionId: string): Promise<ApiChatSession> {
  return invoke("get_api_chat_session", { sessionId });
}
export async function createApiChatSession(input: CreateApiChatSessionInput): Promise<ApiChatSession> {
  return invoke("create_api_chat_session", { input });
}
export async function saveApiChatSession(session: ApiChatSession): Promise<ApiChatSession> {
  return invoke("save_api_chat_session", { session });
}
export async function renameApiChatSession(sessionId: string, title: string): Promise<ApiChatSession> {
  return invoke("rename_api_chat_session", { sessionId, title });
}
export async function deleteApiChatSession(sessionId: string): Promise<void> {
  return invoke("delete_api_chat_session", { sessionId });
}

// ---------- LLM 衔接 ----------
export async function buildApiTools(endpointIds: string[]): Promise<ApiToolsBundle> {
  return invoke("build_api_tools", { endpointIds });
}

export async function executeApiEndpoint(endpointId: string, argumentsJson: string): Promise<ApiExecutionResult> {
  return invoke("execute_api_endpoint", { endpointId, argumentsJson });
}
