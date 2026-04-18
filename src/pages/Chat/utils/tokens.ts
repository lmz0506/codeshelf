import type { ChatMessage } from "@/types";

/** 字符/4 近似，中文按 1.3 倍粗略放大；精度不高但足够感知规模 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const ascii = (text.match(/[\x00-\x7F]/g) ?? []).length;
  const rest = text.length - ascii;
  return Math.ceil(ascii / 4 + rest * 0.8);
}

export function messageTokens(msg: ChatMessage): number {
  let t = estimateTokens(msg.content);
  if (msg.thinkingContent) t += estimateTokens(msg.thinkingContent);
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      t += estimateTokens(tc.name) + estimateTokens(tc.arguments);
    }
  }
  return t;
}

export function sessionTokens(messages: ChatMessage[]): number {
  let sum = 0;
  for (const m of messages) sum += messageTokens(m);
  return sum;
}
