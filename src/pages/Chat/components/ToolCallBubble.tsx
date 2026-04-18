import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import type { ToolCall } from "@/types";

interface ToolCallBubbleProps {
  toolCalls: ToolCall[];
}

function pretty(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

export function ToolCallBubble({ toolCalls }: ToolCallBubbleProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-1.5">
      {toolCalls.map((tc) => {
        const open = expanded[tc.id] ?? false;
        return (
          <div key={tc.id} className="border border-blue-200 bg-blue-50 rounded-lg text-xs">
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5"
              onClick={() => setExpanded((prev) => ({ ...prev, [tc.id]: !open }))}
            >
              <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
              <Wrench size={12} className="text-blue-500" />
              <span className="font-mono text-blue-700">{tc.name || "(tool)"}</span>
              <span className="text-blue-400 truncate flex-1 text-left">
                {tc.arguments ? (tc.arguments.length > 60 ? `${tc.arguments.slice(0, 60)}…` : tc.arguments) : ""}
              </span>
            </button>
            {open && (
              <pre className="font-mono text-[11px] px-2 pb-2 whitespace-pre-wrap break-all text-blue-800">
                {pretty(tc.arguments)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
