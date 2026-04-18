import { useEffect, useMemo, useState } from "react";
import type { ApiEndpoint, ApiGroup } from "@/types";
import { AuthEditor } from "./AuthEditor";

interface EndpointEditorProps {
  initial?: ApiEndpoint;
  groups: ApiGroup[];
  onCancel: () => void;
  onSave: (endpoint: ApiEndpoint) => Promise<void> | void;
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
    paramsSchema: {
      type: "object",
      properties: {},
    },
    responseTrimBytes: undefined,
    createdAt: "",
    updatedAt: "",
  };
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function EndpointEditor({ initial, groups, onCancel, onSave }: EndpointEditorProps) {
  const [ep, setEp] = useState<ApiEndpoint>(initial ?? blank());
  const [schemaText, setSchemaText] = useState<string>(
    JSON.stringify(initial?.paramsSchema ?? blank().paramsSchema, null, 2),
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEp(initial ?? blank());
    setSchemaText(JSON.stringify(initial?.paramsSchema ?? blank().paramsSchema, null, 2));
  }, [initial]);

  const authOverrideEnabled = ep.authOverride !== undefined;

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

  async function submit() {
    if (!ep.name.trim() || !ep.url.trim()) {
      alert("名称和 url 必填");
      return;
    }
    let parsedSchema: Record<string, unknown>;
    try {
      parsedSchema = schemaText.trim() ? JSON.parse(schemaText) : {};
      setSchemaError(null);
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : String(e));
      return;
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
        <div className="text-gray-600 mb-1">
          参数 JSON Schema（OpenAI function-calling 参数定义）
        </div>
        <textarea
          rows={8}
          className="w-full px-2 py-1 border border-gray-200 rounded font-mono"
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
        />
        {schemaError && <div className="text-red-500 mt-1">Schema 无效：{schemaError}</div>}
        <div className="text-[10px] text-gray-400 mt-1">
          顶层字段 <code>_path</code> / <code>_query</code> / <code>_body</code> 可选显式分区；若无则按 method 默认（GET → query，其他 → body）
        </div>
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
