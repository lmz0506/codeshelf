import { useEffect, useMemo, useState } from "react";
import { X, Wrench, Loader2 } from "lucide-react";
import type { ToolSchema } from "@/services/chat";
import { executeTool } from "@/services/chat";

interface ToolPickerProps {
  open: boolean;
  toolSchemas: ToolSchema[];
  sessionId: string | null;
  allowedCwd: string | null;
  onClose: () => void;
  /** 插入 [使用 XXX 工具] hint 到输入框，后续由 LLM 执行 */
  onInsertHint: (hint: string) => void;
  /** 直接绕过 LLM 执行完成后回调：把合成的 assistant+tool 消息对写入会话 */
  onExecuted: (toolName: string, argumentsJson: string, result: string) => void;
}

interface SchemaProp {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  enumValues?: string[];
}

interface ParsedSchema {
  props: SchemaProp[];
  /** schema 无法解析（无 properties），返回 null 时用原始 JSON 文本输入 */
  fallback?: true;
}

function parseSchema(parameters: unknown): ParsedSchema {
  const p = parameters as Record<string, unknown> | null;
  const properties = p && typeof p === "object" ? (p["properties"] as Record<string, any> | undefined) : undefined;
  const required = Array.isArray(p?.required) ? (p!.required as string[]) : [];
  if (!properties || typeof properties !== "object") return { props: [], fallback: true };
  const out: SchemaProp[] = [];
  for (const [name, def] of Object.entries(properties)) {
    const d = def as Record<string, any>;
    out.push({
      name,
      type: (d.type as string) || "string",
      description: typeof d.description === "string" ? d.description : undefined,
      required: required.includes(name),
      enumValues: Array.isArray(d.enum) ? d.enum.map(String) : undefined,
    });
  }
  return { props: out };
}

export function ToolPicker({
  open,
  toolSchemas,
  sessionId,
  allowedCwd,
  onClose,
  onInsertHint,
  onExecuted,
}: ToolPickerProps) {
  const [selected, setSelected] = useState<ToolSchema | null>(null);
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [rawJson, setRawJson] = useState("");
  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuery("");
    setValues({});
    setRawJson("");
    setExecError(null);
  }, [open]);

  useEffect(() => {
    setValues({});
    setRawJson("");
    setExecError(null);
  }, [selected?.name]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return toolSchemas;
    return toolSchemas.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [toolSchemas, query]);

  const parsed = useMemo(() => (selected ? parseSchema(selected.parameters) : null), [selected]);

  if (!open) return null;

  function buildArguments(): { json: string; error: string | null } {
    if (!selected || !parsed) return { json: "{}", error: null };
    if (parsed.fallback) {
      const trimmed = rawJson.trim();
      if (!trimmed) return { json: "{}", error: null };
      try {
        const obj = JSON.parse(trimmed);
        return { json: JSON.stringify(obj), error: null };
      } catch (e) {
        return { json: "{}", error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    const out: Record<string, unknown> = {};
    for (const p of parsed.props) {
      const v = values[p.name];
      if (v === undefined || v === "") {
        if (p.required) return { json: "{}", error: `缺少必填参数：${p.name}` };
        continue;
      }
      if (p.type === "boolean") {
        out[p.name] = Boolean(v);
      } else if (p.type === "integer" || p.type === "number") {
        const n = Number(v);
        if (Number.isNaN(n)) return { json: "{}", error: `${p.name} 应为数字` };
        out[p.name] = p.type === "integer" ? Math.trunc(n) : n;
      } else if (p.type === "object" || p.type === "array") {
        try {
          out[p.name] = JSON.parse(String(v));
        } catch {
          return { json: "{}", error: `${p.name} 需要合法 JSON` };
        }
      } else {
        out[p.name] = String(v);
      }
    }
    return { json: JSON.stringify(out), error: null };
  }

  async function handleDirectExecute() {
    if (!selected) return;
    if (!sessionId) {
      setExecError("请先选择或新建一个会话");
      return;
    }
    if (selected.requiresCwd && !allowedCwd) {
      setExecError("该工具需要会话先设置 allowedCwd 目录");
      return;
    }
    const { json, error } = buildArguments();
    if (error) {
      setExecError(error);
      return;
    }
    setExecError(null);
    setExecuting(true);
    try {
      const result = await executeTool({ sessionId, toolName: selected.name, argumentsJson: json });
      onExecuted(selected.name, json, result);
      onClose();
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
    } finally {
      setExecuting(false);
    }
  }

  function handleInsertHint() {
    if (!selected) return;
    onInsertHint(`[使用 ${selected.name} 工具]\n`);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[760px] max-w-[92vw] h-[72vh] flex overflow-hidden">
        <div className="w-64 border-r border-gray-200 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
            <Wrench size={14} className="text-blue-500" />
            <input
              className="flex-1 text-xs outline-none"
              placeholder="搜索工具..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.map((s) => (
              <button
                key={s.name}
                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-50 ${selected?.name === s.name ? "bg-blue-50" : ""}`}
                onClick={() => setSelected(s)}
              >
                <div className="font-mono text-blue-700 text-xs">{s.name}</div>
                <div className="text-[11px] text-gray-500 truncate">{s.description}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-gray-400">无匹配</div>}
          </div>
        </div>

        <div className="flex-1 flex flex-col p-4 space-y-3 overflow-hidden">
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              选择左侧工具查看参数
            </div>
          )}
          {selected && parsed && (
            <>
              <div className="space-y-1">
                <div className="font-mono font-semibold text-blue-700">{selected.name}</div>
                <div className="text-xs text-gray-500">{selected.description}</div>
                {selected.requiresCwd && !allowedCwd && (
                  <div className="text-[11px] text-amber-600">⚠ 该工具需要会话先设置 allowedCwd 目录</div>
                )}
              </div>

              <div className="flex-1 overflow-auto space-y-2 pr-1">
                {parsed.fallback ? (
                  <div className="space-y-1">
                    <div className="text-[11px] text-gray-500">参数 JSON</div>
                    <textarea
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-mono"
                      rows={8}
                      placeholder='{ "url": "https://..." }'
                      value={rawJson}
                      onChange={(e) => setRawJson(e.target.value)}
                    />
                  </div>
                ) : (
                  parsed.props.map((p) => {
                    const v = values[p.name];
                    const isBool = p.type === "boolean";
                    const isLong = p.type === "object" || p.type === "array";
                    const isEnum = p.enumValues && p.enumValues.length > 0;
                    return (
                      <div key={p.name} className="space-y-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-mono text-gray-700">{p.name}</span>
                          {p.required && <span className="text-[10px] text-red-500">必填</span>}
                          <span className="text-[10px] text-gray-400">{p.type}</span>
                        </div>
                        {p.description && (
                          <div className="text-[11px] text-gray-400 leading-tight">{p.description}</div>
                        )}
                        {isBool ? (
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={Boolean(v)}
                              onChange={(e) => setValues((prev) => ({ ...prev, [p.name]: e.target.checked }))}
                            />
                            <span>{Boolean(v) ? "true" : "false"}</span>
                          </label>
                        ) : isEnum ? (
                          <select
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                            value={typeof v === "string" ? v : ""}
                            onChange={(e) => setValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                          >
                            <option value="">-- 选择 --</option>
                            {p.enumValues!.map((ev) => (
                              <option key={ev} value={ev}>{ev}</option>
                            ))}
                          </select>
                        ) : isLong ? (
                          <textarea
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                            rows={3}
                            placeholder={p.type === "array" ? "[]" : "{}"}
                            value={typeof v === "string" ? v : ""}
                            onChange={(e) => setValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                          />
                        ) : (
                          <input
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                            type={p.type === "integer" || p.type === "number" ? "number" : "text"}
                            placeholder={p.description || p.name}
                            value={typeof v === "string" ? v : ""}
                            onChange={(e) => setValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {execError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{execError}</div>
              )}

              <div className="flex justify-between items-center gap-2">
                <button
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
                  onClick={handleInsertHint}
                  title="在输入框插入 [使用 XXX 工具] 前缀；发送时前端会强制 LLM 调该工具"
                  disabled={executing}
                >
                  插入 hint（交给 LLM）
                </button>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
                    onClick={onClose}
                    disabled={executing}
                  >
                    取消
                  </button>
                  <button
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg flex items-center gap-1 disabled:opacity-60"
                    onClick={handleDirectExecute}
                    disabled={executing || !sessionId}
                    title="绕过 LLM 直接以上述参数执行"
                  >
                    {executing && <Loader2 size={12} className="animate-spin" />}
                    直接执行
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
