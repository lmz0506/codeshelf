import { useEffect, useMemo, useState } from "react";
import type { ApiEndpoint, ApiGroup } from "@/types";
import { AuthEditor } from "./AuthEditor";

interface EndpointEditorProps {
  initial?: ApiEndpoint;
  groups: ApiGroup[];
  onCancel: () => void;
  onSave: (endpoint: ApiEndpoint) => Promise<void> | void;
}

type ParamType = "string" | "number" | "integer" | "boolean";

interface FormParam {
  key: string;
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
}

const PARAM_TYPES: ParamType[] = ["string", "number", "integer", "boolean"];

function newParamKey(): string {
  return Math.random().toString(36).slice(2);
}

function blankSchema(): Record<string, unknown> {
  return { type: "object", properties: {} };
}

function blank(): ApiEndpoint {
  return {
    id: "",
    name: "",
    description: "",
    groupId: undefined,
    method: "GET",
    url: "",
    headers: [],
    authOverride: undefined,
    paramsSchema: blankSchema(),
    responseTrimBytes: undefined,
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * 把 JSON Schema 转换为表单参数列表。
 * 只处理简单顶层 object schema；若含数组 / 嵌套对象 / 未知字段则返回 null，由调用方降级到高级模式。
 */
function schemaToParams(schema: unknown): FormParam[] | null {
  if (schema == null) return [];
  if (typeof schema !== "object") return null;
  const s = schema as Record<string, unknown>;
  if (Object.keys(s).length === 0) return [];

  const allowedTop = new Set(["type", "properties", "required"]);
  for (const k of Object.keys(s)) {
    if (!allowedTop.has(k)) return null;
  }
  if (s.type !== undefined && s.type !== "object") return null;

  const props = s.properties;
  if (props !== undefined && (props === null || typeof props !== "object" || Array.isArray(props))) {
    return null;
  }
  const propsObj = (props ?? {}) as Record<string, unknown>;
  const required = Array.isArray(s.required)
    ? (s.required as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const params: FormParam[] = [];
  for (const [name, def] of Object.entries(propsObj)) {
    if (!def || typeof def !== "object" || Array.isArray(def)) return null;
    const d = def as Record<string, unknown>;
    const allowedProp = new Set(["type", "description"]);
    for (const k of Object.keys(d)) {
      if (!allowedProp.has(k)) return null;
    }
    const t = d.type;
    if (t !== "string" && t !== "number" && t !== "integer" && t !== "boolean") return null;
    params.push({
      key: newParamKey(),
      name,
      type: t,
      description: typeof d.description === "string" ? d.description : "",
      required: required.includes(name),
    });
  }
  return params;
}

function paramsToSchema(params: FormParam[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    const name = p.name.trim();
    if (!name) continue;
    const def: Record<string, unknown> = { type: p.type };
    if (p.description.trim()) def.description = p.description.trim();
    properties[name] = def;
    if (p.required) required.push(name);
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function EndpointEditor({ initial, groups, onCancel, onSave }: EndpointEditorProps) {
  const [ep, setEp] = useState<ApiEndpoint>(initial ?? blank());

  const initialParams = useMemo(
    () => schemaToParams(initial?.paramsSchema ?? blankSchema()),
    [initial],
  );
  const [mode, setMode] = useState<"form" | "schema">(
    initialParams !== null ? "form" : "schema",
  );
  const [params, setParams] = useState<FormParam[]>(initialParams ?? []);
  const [schemaText, setSchemaText] = useState<string>(
    JSON.stringify(initial?.paramsSchema ?? blankSchema(), null, 2),
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextEp = initial ?? blank();
    setEp(nextEp);
    const asParams = schemaToParams(nextEp.paramsSchema);
    if (asParams !== null) {
      setMode("form");
      setParams(asParams);
    } else {
      setMode("schema");
      setParams([]);
    }
    setSchemaText(JSON.stringify(nextEp.paramsSchema ?? blankSchema(), null, 2));
    setSchemaError(null);
  }, [initial]);

  const authOverrideEnabled = ep.authOverride != null;

  const effectiveGroupBaseUrl = useMemo(
    () => groups.find((g) => g.id === ep.groupId)?.baseUrl ?? "",
    [groups, ep.groupId],
  );

  function updateHeaders(idx: number, key: "k" | "v", val: string) {
    const next = ep.headers.map((h, i) => {
      if (i !== idx) return h;
      return key === "k" ? ([val, h[1]] as [string, string]) : ([h[0], val] as [string, string]);
    });
    setEp({ ...ep, headers: next });
  }

  function updateParam(key: string, patch: Partial<FormParam>) {
    setParams((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function addParam() {
    setParams((prev) => [
      ...prev,
      { key: newParamKey(), name: "", type: "string", description: "", required: false },
    ]);
  }

  function removeParam(key: string) {
    setParams((prev) => prev.filter((p) => p.key !== key));
  }

  function switchToSchema() {
    setSchemaText(JSON.stringify(paramsToSchema(params), null, 2));
    setSchemaError(null);
    setMode("schema");
  }

  function switchToForm() {
    let parsed: unknown;
    try {
      parsed = schemaText.trim() ? JSON.parse(schemaText) : {};
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : String(e));
      return;
    }
    const asParams = schemaToParams(parsed);
    if (asParams === null) {
      setSchemaError("当前 Schema 含高级字段（数组 / 嵌套对象 / _path 等），无法转换回表单");
      return;
    }
    setSchemaError(null);
    setParams(asParams);
    setMode("form");
  }

  async function submit() {
    if (!ep.name.trim() || !ep.url.trim()) {
      alert("名称和 url 必填");
      return;
    }
    let parsedSchema: Record<string, unknown>;
    if (mode === "form") {
      for (const p of params) {
        if (!p.name.trim()) {
          alert("参数名不能为空");
          return;
        }
      }
      parsedSchema = paramsToSchema(params);
    } else {
      try {
        parsedSchema = schemaText.trim() ? JSON.parse(schemaText) : {};
        setSchemaError(null);
      } catch (e) {
        setSchemaError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setSaving(true);
    try {
      await onSave({ ...ep, paramsSchema: parsedSchema });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-600 w-20">名称</span>
        <input
          className="flex-1 px-2 py-1 border border-gray-200 rounded"
          value={ep.name}
          onChange={(e) => setEp({ ...ep, name: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600 w-20">分组</span>
        <select
          className="flex-1 px-2 py-1 border border-gray-200 rounded"
          value={ep.groupId ?? ""}
          onChange={(e) => setEp({ ...ep, groupId: e.target.value || undefined })}
        >
          <option value="">（独立接口）</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600 w-20">请求</span>
        <select
          className="px-2 py-1 border border-gray-200 rounded"
          value={ep.method}
          onChange={(e) => setEp({ ...ep, method: e.target.value })}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
          placeholder="/users/{id} 或完整 URL"
          value={ep.url}
          onChange={(e) => setEp({ ...ep, url: e.target.value })}
        />
      </div>
      {effectiveGroupBaseUrl && !ep.url.startsWith("http") && (
        <div className="text-[10px] text-gray-400 pl-20">
          实际 URL：{effectiveGroupBaseUrl.replace(/\/$/, "")}{ep.url.startsWith("/") ? "" : "/"}{ep.url}
        </div>
      )}

      <div className="flex items-start gap-2">
        <span className="text-gray-600 w-20 mt-1">描述</span>
        <textarea
          rows={2}
          className="flex-1 px-2 py-1 border border-gray-200 rounded"
          placeholder="给大模型看的：此接口用途，何时调用它"
          value={ep.description ?? ""}
          onChange={(e) => setEp({ ...ep, description: e.target.value })}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-600">固定 headers</span>
          <button
            className="text-blue-500 hover:underline text-[11px]"
            onClick={() => setEp({ ...ep, headers: [...ep.headers, ["", ""]] })}
          >
            + 添加
          </button>
        </div>
        {ep.headers.length === 0 && <div className="text-gray-400">（无）</div>}
        {ep.headers.map(([k, v], idx) => (
          <div key={idx} className="flex items-center gap-2 mb-1">
            <input
              className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
              placeholder="Header-Name"
              value={k}
              onChange={(e) => updateHeaders(idx, "k", e.target.value)}
            />
            <input
              className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
              placeholder="value"
              value={v}
              onChange={(e) => updateHeaders(idx, "v", e.target.value)}
            />
            <button
              className="text-gray-400 hover:text-red-500"
              onClick={() => setEp({ ...ep, headers: ep.headers.filter((_, i) => i !== idx) })}
            >×</button>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-600">
            参数（LLM 调用时填充）
          </span>
          <div className="flex items-center gap-3">
            {mode === "form" ? (
              <button
                type="button"
                className="text-blue-500 hover:underline text-[11px]"
                onClick={switchToSchema}
              >
                高级（JSON Schema）
              </button>
            ) : (
              <button
                type="button"
                className="text-blue-500 hover:underline text-[11px]"
                onClick={switchToForm}
              >
                返回表单
              </button>
            )}
            {mode === "schema" && (
              <button
                type="button"
                className="text-blue-500 hover:underline text-[11px]"
                onClick={() => {
                  try {
                    const parsed = schemaText.trim() ? JSON.parse(schemaText) : {};
                    setSchemaText(JSON.stringify(parsed, null, 2));
                    setSchemaError(null);
                  } catch (e) {
                    setSchemaError(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                格式化
              </button>
            )}
          </div>
        </div>

        {mode === "form" ? (
          <div className="space-y-2">
            {params.length === 0 && (
              <div className="text-gray-400">（无参数，点下方添加）</div>
            )}
            {params.map((p) => (
              <div key={p.key} className="flex items-start gap-2">
                <input
                  className="w-28 px-2 py-1 border border-gray-200 rounded font-mono"
                  placeholder="参数名"
                  value={p.name}
                  onChange={(e) => updateParam(p.key, { name: e.target.value })}
                />
                <select
                  className="w-24 px-2 py-1 border border-gray-200 rounded"
                  value={p.type}
                  onChange={(e) => updateParam(p.key, { type: e.target.value as ParamType })}
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  className="flex-1 px-2 py-1 border border-gray-200 rounded"
                  placeholder="说明：告诉大模型此参数用途"
                  value={p.description}
                  onChange={(e) => updateParam(p.key, { description: e.target.value })}
                />
                <label className="flex items-center gap-1 pt-1 text-gray-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={p.required}
                    onChange={(e) => updateParam(p.key, { required: e.target.checked })}
                  />
                  必填
                </label>
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-500 pt-1"
                  onClick={() => removeParam(p.key)}
                  title="删除参数"
                >×</button>
              </div>
            ))}
            <button
              type="button"
              className="text-blue-500 hover:underline text-[11px]"
              onClick={addParam}
            >
              + 添加参数
            </button>
          </div>
        ) : (
          <>
            <textarea
              rows={8}
              className="w-full px-2 py-1 border border-gray-200 rounded font-mono"
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
            />
            <div className="text-[10px] text-gray-400 mt-1">
              顶层字段 <code>_path</code> / <code>_query</code> / <code>_body</code> 可选显式分区；若无则按 method 默认（GET → query，其他 → body）
            </div>
          </>
        )}
        {schemaError && <div className="text-red-500 mt-1">Schema 无效：{schemaError}</div>}
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={authOverrideEnabled}
            onChange={(e) =>
              setEp({ ...ep, authOverride: e.target.checked ? { type: "none" } : undefined })
            }
          />
          <span className="text-gray-600">鉴权覆盖（默认继承所属组）</span>
        </label>
        {authOverrideEnabled && (
          <div className="mt-2 border border-gray-200 rounded p-2">
            <AuthEditor
              value={ep.authOverride!}
              onChange={(auth) => setEp({ ...ep, authOverride: auth })}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button className="px-3 py-1.5 border border-gray-200 rounded-lg" onClick={onCancel}>
          取消
        </button>
        <button
          className="px-3 py-1.5 bg-blue-500 text-white rounded-lg disabled:opacity-60"
          onClick={submit}
          disabled={saving}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
