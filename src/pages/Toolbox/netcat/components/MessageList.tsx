// 消息列表组件

import { useRef, useEffect } from "react";
import { Radio, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { NetcatMessage } from "@/types/toolbox";

interface MessageListProps {
  messages: NetcatMessage[];
  autoScroll: boolean;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString();
}

export default function MessageList({ messages, autoScroll }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-900 font-mono text-sm">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <Radio size={32} className="mb-2 opacity-50" />
          <p>暂无消息</p>
        </div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-1 flex items-start gap-2 ${
              msg.direction === "sent" ? "text-green-400" : "text-cyan-400"
            }`}
          >
            <span className="text-gray-500 shrink-0">[{formatTime(msg.timestamp)}]</span>
            <span className={`shrink-0 flex items-center gap-0.5 ${
              msg.direction === "sent" ? "text-green-500" : "text-cyan-500"
            }`}>
              {msg.direction === "sent" ? (
                <>
                  <ArrowUpRight size={14} />
                  <span className="text-xs">发</span>
                </>
              ) : msg.direction === "received" ? (
                <>
                  <ArrowDownLeft size={14} />
                  <span className="text-xs">收</span>
                </>
              ) : (
                <span className="text-xs text-red-500">[{msg.direction}]</span>
              )}
            </span>
            {msg.clientAddr && (
              <span className="text-gray-400 shrink-0">[{msg.clientAddr}]</span>
            )}
            <span className="whitespace-pre-wrap break-all">{msg.data}</span>
            <span className="text-gray-600 shrink-0">({msg.size}B)</span>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
