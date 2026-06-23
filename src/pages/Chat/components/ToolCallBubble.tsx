import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import type { ToolCall } from "@/types";

export interface EndpointMeta {
  method: string;
  url: string;
  name?: string;
}

interface ToolCallBubbleProps {
  toolCalls: ToolCall[];
  endpointLookup?: (toolName: string) => EndpointMeta | null;
}

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function parseArgs(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/// 把 arguments 拆成 _path / _query / _body / others 四段（若未显式分区则全归在 others）
function splitArgs(parsed: unknown): {
  path?: unknown;
  query?: unknown;
  body?: unknown;
  others?: Record<string, unknown>;
  raw?: unknown;
} {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { raw: parsed };
  }
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  const partitioned = keys.some((k) => k === "_path" || k === "_query" || k === "_body");
  if (!partitioned) return { others: obj };
  const others: Record<string, unknown> = {};
  for (const k of keys) {
    if (k !== "_path" && k !== "_query" && k !== "_body") others[k] = obj[k];
  }
  return {
    path: obj._path,
    query: obj._query,
    body: obj._body,
    others: Object.keys(others).length > 0 ? others : undefined,
  };
}

function ArgsSection({ title, value }: { title: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-blue-500">{title}</div>
      <pre className="font-mono text-[11px] whitespace-pre-wrap break-all text-blue-800 m-0">
        {prettyJson(value)}
      </pre>
    </div>
  );
}

export function ToolCallBubble({ toolCalls, endpointLookup }: ToolCallBubbleProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-1.5">
      {toolCalls.map((tc) => {
        const open = expanded[tc.id] ?? false;
        const meta = endpointLookup?.(tc.name) ?? null;
        const parsed = parseArgs(tc.arguments || "");
        const sections = splitArgs(parsed);
        const summary = tc.arguments
          ? tc.arguments.length > 60
            ? `${tc.arguments.slice(0, 60)}…`
            : tc.arguments
          : "";
        return (
          <div key={tc.id} className="border border-blue-200 bg-blue-50 rounded-lg text-xs">
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5"
              onClick={() => setExpanded((prev) => ({ ...prev, [tc.id]: !open }))}
            >
              <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
              <Wrench size={12} className="text-blue-500" />
              {meta ? (
                <>
                  <span className="font-semibold text-blue-700 uppercase">{meta.method}</span>
                  <span className="font-mono text-blue-700 truncate">{meta.url}</span>
                  {meta.name && <span className="text-[10px] text-blue-400">（{meta.name}）</span>}
                </>
              ) : (
                <span className="font-mono text-blue-700">{tc.name || "(tool)"}</span>
              )}
              {!open && (
                <span className="text-blue-400 truncate flex-1 text-left">{summary}</span>
              )}
            </button>
            {open && (
              <div className="px-2 pb-2 space-y-2">
                <ArgsSection title="path" value={sections.path} />
                <ArgsSection title="query" value={sections.query} />
                <ArgsSection title="body" value={sections.body} />
                {sections.others !== undefined && (
                  <ArgsSection title="arguments" value={sections.others} />
                )}
                {sections.raw !== undefined && (
                  <pre className="font-mono text-[11px] whitespace-pre-wrap break-all text-blue-800 m-0">
                    {prettyJson(sections.raw)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
