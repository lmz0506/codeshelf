import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/types";
import { MessageItem } from "./MessageItem";
import type { EndpointMeta } from "./ToolCallBubble";

interface MessageListProps {
  messages: ChatMessage[];
  streaming: boolean;
  thinkingBuffer: string;
  onCopy: (msg: ChatMessage) => void;
  onEditUser: (msg: ChatMessage, newContent: string) => void;
  onRegenerateAssistant: (msg: ChatMessage) => void;
  onRetryUser: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  endpointLookup?: (toolName: string) => EndpointMeta | null;
}

export function MessageList({
  messages,
  streaming,
  thinkingBuffer,
  onCopy,
  onEditUser,
  onRegenerateAssistant,
  onRetryUser,
  onDelete,
  endpointLookup,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingBuffer]);

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  const thinkingVisible = streaming && thinkingBuffer.length > 0 && (
    messages.length === 0 || messages[messages.length - 1].role !== "assistant"
  );

  return (
    <div className="flex-1 space-y-4 overflow-auto overflow-x-hidden pb-4 min-w-0">
      {messages.map((msg, idx) => (
        <MessageItem
          key={msg.id}
          message={msg}
          streaming={streaming}
          streamingThisMessage={streaming && idx === lastAssistantIdx && msg.role === "assistant"}
          isLastAssistant={idx === lastAssistantIdx}
          onCopy={() => onCopy(msg)}
          onEditUser={(next) => onEditUser(msg, next)}
          onRegenerate={() => onRegenerateAssistant(msg)}
          onRetry={() => onRetryUser(msg)}
          onDelete={() => onDelete(msg)}
          endpointLookup={endpointLookup}
        />
      ))}
      {thinkingVisible && (
        <div className="flex justify-start">
          <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-purple-50 text-purple-600 border border-purple-100">
            <div className="text-[11px] mb-1 text-purple-400">thinking</div>
            <div className="text-xs whitespace-pre-wrap">{thinkingBuffer}</div>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
