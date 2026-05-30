import { useEffect, useMemo, useState } from "react";
import { ArrowDown, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { showToast } from "@/components/ui";
import { CronBuilder } from "@/components/cron";
import { useAiProvidersStore } from "@/stores/aiProvidersStore";
import { saveWorkflow, type Workflow, type WorkflowNode } from "@/services/workflows";

interface Props {
  open: boolean;
  workflow: Workflow | null;
  onClose: () => void;
  onSaved: () => void;
}

const NODE_TYPES = [
  { value: "web_fetch", label: "🌐 网页抓取 (web_fetch)" },
  { value: "llm", label: "🤖 LLM 处理 (llm)" },
  { value: "webhook", label: "📤 Webhook 推送 (webhook)" },
];

function uid() { return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

function blankNode(type: string): WorkflowNode {
  const base: WorkflowNode = { id: uid(), nodeType: type, config: {}, dependsOn: [] };
  if (type === "web_fetch") base.config = { url: "", maxBytes: 400000 };
  if (type === "llm") base.config = { providerId: "", modelId: "", prompt: "" };
  if (type === "webhook") base.config = { kind: "feishu", region: "feishu", token: "", bodyTemplate: "" };
  return base;
}

export function WorkflowEditor({ open, workflow, onClose, onSaved }: Props) {
  const { aiProviders } = useAiProvidersStore();
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [enabled, setEnabled] = useState(true);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (workflow) {
      setName(workflow.name);
      setCron(workflow.cron);
      setEnabled(workflow.enabled);
      setNodes(workflow.nodes);
    } else {
      setName("新工作流");
      setCron("0 9 * * *");
      setEnabled(true);
      setNodes([blankNode("web_fetch")]);
    }
  }, [open, workflow]);

  const otherIds = useMemo(() => nodes.map((n) => n.id), [nodes]);

  if (!open) return null;

  function updateNode(idx: number, next: WorkflowNode) {
    setNodes((prev) => prev.map((n, i) => (i === idx ? next : n)));
  }
  function removeNode(idx: number) {
    setNodes((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveNode(idx: number, dir: -1 | 1) {
    setNodes((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function addNode(type: string) {
    const n = blankNode(type);
    // 默认依赖上一个节点（方便串联）
    if (nodes.length > 0) n.dependsOn = [nodes[nodes.length - 1].id];
    setNodes((prev) => [...prev, n]);
  }

  async function handleSave() {
    if (!name.trim()) { showToast("warning", "填写名称"); return; }
    if (nodes.length === 0) { showToast("warning", "至少一个节点"); return; }
    setSaving(true);
    try {
      const wf: Workflow = {
        id: workflow?.id ?? "",
        name: name.trim(),
        cron: cron.trim(),
        enabled,
        nodes,
        lastRun: workflow?.lastRun ?? null,
        createdAt: workflow?.createdAt ?? "",
        updatedAt: workflow?.updatedAt ?? "",
      };
      await saveWorkflow(wf);
      showToast("success", "已保存");
      onSaved();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg w-[720px] max-w-[95vw] max-h-[92vh] overflow-y-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold">{workflow ? "编辑工作流" : "新建工作流"}</div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-700">
            名称
            <input className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="text-xs text-gray-700">
            触发时间
            <CronBuilder value={cron} onChange={setCron} className="mt-1" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用（到时自动触发）
        </label>

        <div className="space-y-3">
          {nodes.map((n, idx) => (
            <div key={n.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">{n.id}</span>
                <select
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                  value={n.nodeType}
                  onChange={(e) => updateNode(idx, { ...n, nodeType: e.target.value, config: blankNode(e.target.value).config })}
                >
                  {NODE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button className="text-gray-400 hover:text-blue-500 p-1" title="上移" onClick={() => moveNode(idx, -1)}><ChevronUp size={14} /></button>
                <button className="text-gray-400 hover:text-blue-500 p-1" title="下移" onClick={() => moveNode(idx, 1)}><ChevronDown size={14} /></button>
                <button className="text-gray-400 hover:text-red-500 p-1" title="删除" onClick={() => removeNode(idx)}><Trash2 size={14} /></button>
              </div>

              {/* 依赖 */}
              <div className="text-[11px] text-gray-600">
                依赖于（勾选上游节点，其输出可在下面用 {"{{id}}"} 引用）：
                <div className="flex flex-wrap gap-2 mt-1">
                  {otherIds.filter((oid) => oid !== n.id).map((oid) => (
                    <label key={oid} className="flex items-center gap-1 font-mono">
                      <input
                        type="checkbox"
                        checked={n.dependsOn.includes(oid)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...n.dependsOn, oid]
                            : n.dependsOn.filter((x) => x !== oid);
                          updateNode(idx, { ...n, dependsOn: next });
                        }}
                      />
                      {oid}
                    </label>
                  ))}
                </div>
              </div>

              {/* 节点类型配置 */}
              {n.nodeType === "web_fetch" && (
                <div className="space-y-1">
                  <input
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                    placeholder="URL (https://...)"
                    value={n.config.url ?? ""}
                    onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, url: e.target.value } })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                      placeholder="CSS 选择器（可选，如 article.markdown-body）"
                      value={n.config.selector ?? ""}
                      onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, selector: e.target.value } })}
                    />
                    <select
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      value={n.config.extractMode ?? "text"}
                      onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, extractMode: e.target.value } })}
                    >
                      <option value="text">取文本</option>
                      <option value="html">取 HTML</option>
                    </select>
                  </div>
                  <input
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                    placeholder="正则（可选，取捕获组1或整段匹配，多个按行拼接）"
                    value={n.config.regex ?? ""}
                    onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, regex: e.target.value } })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1"
                      placeholder="maxBytes (默认 400000)"
                      type="number"
                      value={n.config.maxBytes ?? 400000}
                      onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, maxBytes: Number(e.target.value) } })}
                    />
                    <input
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1"
                      placeholder="超时 ms (默认 30000)"
                      type="number"
                      value={n.config.timeoutMs ?? 30000}
                      onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, timeoutMs: Number(e.target.value) } })}
                    />
                  </div>
                  <input
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                    placeholder="代理（可选，如 http://127.0.0.1:7890；连不上的站点用）"
                    value={n.config.proxy ?? ""}
                    onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, proxy: e.target.value } })}
                  />
                  <div className="text-[11px] text-gray-400 leading-relaxed">
                    规则提取（通用，适用任意网站）：先按 CSS 选择器命中元素，再按正则二次提取；两者都留空则返回正文（HTML 自动转纯文本）。
                  </div>
                </div>
              )}

              {n.nodeType === "llm" && (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1"
                      value={n.config.providerId ?? ""}
                      onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, providerId: e.target.value, modelId: "" } })}
                    >
                      <option value="">选择供应商</option>
                      {aiProviders.filter((p) => p.enabled).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1"
                      value={n.config.modelId ?? ""}
                      onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, modelId: e.target.value } })}
                    >
                      <option value="">选择模型</option>
                      {aiProviders.find((p) => p.id === n.config.providerId)?.models.filter((m) => m.enabled).map((m) => (
                        <option key={m.id} value={m.id}>{m.model}</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                    rows={4}
                    placeholder={"prompt，支持 {{上游节点id}} 替换。例：\n请用中文总结以下内容要点：\n{{fetch}}"}
                    value={n.config.prompt ?? ""}
                    onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, prompt: e.target.value } })}
                  />
                  {n.dependsOn.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap text-[11px] text-gray-500">
                      插入上游输出：
                      {n.dependsOn.map((oid) => (
                        <button
                          key={oid}
                          type="button"
                          className="font-mono px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-100"
                          onClick={() => updateNode(idx, { ...n, config: { ...n.config, prompt: `${n.config.prompt ?? ""}{{${oid}}}` } })}
                        >
                          {`{{${oid}}}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {n.nodeType === "webhook" && (
                <div className="space-y-1">
                  <select
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                    value={n.config.kind ?? "feishu"}
                    onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, kind: e.target.value } })}
                  >
                    <option value="feishu">飞书 / Lark 机器人</option>
                    <option value="wecom">企业微信机器人</option>
                    <option value="http">通用 HTTP POST</option>
                  </select>
                  {n.config.kind === "feishu" && (
                    <>
                      <select
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                        value={n.config.region ?? "feishu"}
                        onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, region: e.target.value } })}
                      >
                        <option value="feishu">飞书（feishu.cn，国内）</option>
                        <option value="lark">Lark（larksuite.com，国际）</option>
                      </select>
                      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono" placeholder="token 或整条 hook 链接（粘整条链接时自动识别区域）"
                        value={n.config.token ?? ""} onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, token: e.target.value } })} />
                    </>
                  )}
                  {n.config.kind === "wecom" && (
                    <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono" placeholder="企业微信 webhook key 或整条链接"
                      value={n.config.key ?? ""} onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, key: e.target.value } })} />
                  )}
                  {n.config.kind === "http" && (
                    <>
                      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono" placeholder="URL"
                        value={n.config.url ?? ""} onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, url: e.target.value } })} />
                      <div className="flex gap-2">
                        <select className="text-xs border border-gray-200 rounded px-2 py-1"
                          value={n.config.method ?? "POST"} onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, method: e.target.value } })}>
                          <option>POST</option><option>PUT</option><option>DELETE</option>
                        </select>
                        <input className="flex-1 text-xs border border-gray-200 rounded px-2 py-1" placeholder="Content-Type（默认 application/json）"
                          value={n.config.contentType ?? ""} onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, contentType: e.target.value } })} />
                      </div>
                    </>
                  )}
                  {n.dependsOn.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap text-[11px] text-gray-500">
                      插入上游输出：
                      {n.dependsOn.map((oid) => (
                        <button
                          key={oid}
                          type="button"
                          className="font-mono px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-100"
                          onClick={() => updateNode(idx, { ...n, config: { ...n.config, bodyTemplate: `${n.config.bodyTemplate ?? ""}{{${oid}}}` } })}
                        >
                          {`{{${oid}}}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                    rows={4}
                    placeholder={"body 模板（支持 {{上游id}}，点上方按钮插入）。飞书/企微填要发的文本；HTTP 填 JSON/任意 body。"}
                    value={n.config.bodyTemplate ?? ""}
                    onChange={(e) => updateNode(idx, { ...n, config: { ...n.config, bodyTemplate: e.target.value } })}
                  />
                </div>
              )}

              {idx < nodes.length - 1 && <div className="flex justify-center text-gray-300"><ArrowDown size={16} /></div>}
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-center">
          <button className="text-xs border border-gray-200 rounded px-3 py-1 hover:bg-gray-50 flex items-center gap-1" onClick={() => addNode("web_fetch")}>
            <Plus size={12} /> web_fetch
          </button>
          <button className="text-xs border border-gray-200 rounded px-3 py-1 hover:bg-gray-50 flex items-center gap-1" onClick={() => addNode("llm")}>
            <Plus size={12} /> llm
          </button>
          <button className="text-xs border border-gray-200 rounded px-3 py-1 hover:bg-gray-50 flex items-center gap-1" onClick={() => addNode("webhook")}>
            <Plus size={12} /> webhook
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button className="px-3 py-1.5 text-xs border border-gray-200 rounded" onClick={onClose}>取消</button>
          <button className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded disabled:opacity-60" disabled={saving} onClick={handleSave}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
