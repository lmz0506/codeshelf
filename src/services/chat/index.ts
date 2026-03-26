import { invoke } from "@tauri-apps/api/core";
import type { ChatSession, ChatSessionSummary } from "@/types";

export interface ChatStreamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatStreamRequest {
  requestId: string;
  providerId: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  thinking?: boolean;
  messages: ChatStreamMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface CreateChatSessionInput {
  title?: string;
  providerId: string;
  modelId: string;
}

export async function getChatHistoryDir(): Promise<string> {
  return invoke("get_chat_history_dir");
}

export async function migrateChatHistoryDir(newDir: string): Promise<string> {
  return invoke("migrate_chat_history_dir", { newDir });
}

export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  return invoke("list_chat_sessions");
}

export async function getChatSession(sessionId: string): Promise<ChatSession> {
  return invoke("get_chat_session", { sessionId });
}

export async function createChatSession(input: CreateChatSessionInput): Promise<ChatSession> {
  return invoke("create_chat_session", { input });
}

export async function saveChatSession(session: ChatSession): Promise<ChatSession> {
  return invoke("save_chat_session", { session });
}

export async function renameChatSession(sessionId: string, title: string): Promise<ChatSession> {
  return invoke("rename_chat_session", { sessionId, title });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  return invoke("delete_chat_session", { sessionId });
}

export async function chatStream(request: ChatStreamRequest): Promise<void> {
  return invoke("chat_stream", { request });
}

export async function chatCancel(requestId: string): Promise<void> {
  return invoke("chat_cancel", { requestId });
}
