import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { showToast } from "@/components/ui";
import type { ApiEndpoint, ApiGroup } from "@/types";
import {
  deleteApiEndpoint,
  deleteApiGroup,
  listApiEndpoints,
  listApiGroups,
  saveApiEndpoint,
  saveApiGroup,
} from "@/services/api_chat";
import { GroupEditor } from "./GroupEditor";
import { EndpointEditor } from "./EndpointEditor";

interface LibraryManagerDialogProps {
  open: boolean;
  onClose: () => void;
  /** 关闭时外部可以重新拉一次列表 */
  onChanged?: () => void;
}

type EditingGroup = { kind: "group"; data?: ApiGroup };
type EditingEndpoint = { kind: "endpoint"; data?: ApiEndpoint };
type Editing = EditingGroup | EditingEndpoint | null;

export function LibraryManagerDialog({ open, onClose, onChanged }: LibraryManagerDialogProps) {
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | "__all__" | "__orphan__">("__all__");

  async function reload() {
    setLoading(true);
    try {
      const [g, e] = await Promise.all([listApiGroups(), listApiEndpoints()]);
      setGroups(g);
      setEndpoints(e);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      reload();
      setEditing(null);
      setActiveGroupId("__all__");
    }
  }, [open]);

  const filteredEndpoints = useMemo(() => {
    if (activeGroupId === "__all__") return endpoints;
    if (activeGroupId === "__orphan__") return endpoints.filter((e) => !e.groupId);
    return endpoints.filter((e) => e.groupId === activeGroupId);
  }, [endpoints, activeGroupId]);

  async function handleSaveGroup(g: ApiGroup) {
    try {
      await saveApiGroup(g);
      showToast("success", "已保存");
      setEditing(null);
      await reload();
      onChanged?.();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "保存失败");
    }
  }

  async function handleSaveEndpoint(e: ApiEndpoint) {
    try {
      await saveApiEndpoint(e);
      showToast("success", "已保存");
      setEditing(null);
      await reload();
      onChanged?.();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "保存失败");
    }
  }

  async function handleDeleteGroup(g: ApiGroup) {
    if (!confirm(`删除分组「${g.name}」？组内接口将变为独立接口。`)) return;
    try {
      await deleteApiGroup(g.id);
      await reload();
      onChanged?.();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "删除失败");
    }
  }

  async function handleDeleteEndpoint(e: ApiEndpoint) {
    if (!confirm(`删除接口「${e.name}」？`)) return;
    try {
      await deleteApiEndpoint(e.id);
      await reload();
      onChanged?.();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "删除失败");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-[960px] max-w-[95vw] h-[720px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold">📚 接口库管理</div>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* 左侧分组列表 */}
          <div className="w-64 border-r border-gray-200 flex flex-col">
            <div className="flex items-center justify-between p-3">
              <div className="text-xs font-semibold text-gray-700">分组</div>
              <button
                className="text-blue-500 hover:underline text-xs flex items-center gap-1"
                onClick={() => setEditing({ kind: "group", data: undefined })}
              >
                <Plus size={12} /> 新建
              </button>
            </div>
            <div className="flex-1 overflow-auto px-2 pb-2 space-y-1 text-xs">
              <button
                className={`w-full text-left px-2 py-1.5 rounded ${activeGroupId === "__all__" ? "bg-blue-50 text-blue-600" : "hover:bg-gray-50"}`}
                onClick={() => setActiveGroupId("__all__")}
              >
                全部接口（{endpoints.length}）
              </button>
              <button
                className={`w-full text-left px-2 py-1.5 rounded ${activeGroupId === "__orphan__" ? "bg-blue-50 text-blue-600" : "hover:bg-gray-50"}`}
                onClick={() => setActiveGroupId("__orphan__")}
              >
                独立接口（{endpoints.filter((e) => !e.groupId).length}）
              </button>
              <div className="border-t border-gray-100 my-2" />
              {groups.map((g) => (
                <div
                  key={g.id}
                  className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer ${activeGroupId === g.id ? "bg-blue-50 text-blue-600" : "hover:bg-gray-50"}`}
                  onClick={() => setActiveGroupId(g.id)}
                >
                  <span className="flex-1 truncate" title={g.name}>{g.name}</span>
                  <span className="text-[10px] text-gray-400">
                    {endpoints.filter((e) => e.groupId === g.id).length}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditing({ kind: "group", data: g });
                    }}
                    title="编辑"
                  >
                    <Edit2 size={11} />
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleDeleteGroup(g);
                    }}
                    title="删除"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {!loading && groups.length === 0 && (
                <div className="text-gray-400 px-2">暂无分组</div>
              )}
            </div>
          </div>

          {/* 右侧接口列表 / 编辑器 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="text-xs font-semibold text-gray-700">
                接口（{filteredEndpoints.length}）
              </div>
              <button
                className="text-blue-500 hover:underline text-xs flex items-center gap-1"
                onClick={() =>
                  setEditing({
                    kind: "endpoint",
                    data: undefined,
                  })
                }
              >
                <Plus size={12} /> 新建接口
              </button>
            </div>

            <div className="flex-1 flex min-h-0">
              <div className="w-[46%] border-r border-gray-200 overflow-auto">
                {filteredEndpoints.map((ep) => (
                  <div
                    key={ep.id}
                    className={`group flex items-center gap-2 px-3 py-2 text-xs border-b border-gray-100 cursor-pointer ${
                      editing?.kind === "endpoint" && editing.data?.id === ep.id ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                    onClick={() => setEditing({ kind: "endpoint", data: ep })}
                  >
                    <span
                      className={`font-mono px-1.5 py-0.5 rounded text-[10px] ${
                        ep.method === "GET"
                          ? "bg-green-100 text-green-700"
                          : ep.method === "DELETE"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{ep.name}</div>
                      <div className="truncate text-gray-400 font-mono text-[10px]">{ep.url}</div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEndpoint(ep);
                      }}
                      title="删除"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                {!loading && filteredEndpoints.length === 0 && (
                  <div className="p-4 text-gray-400 text-xs">暂无接口</div>
                )}
              </div>

              <div className="flex-1 overflow-auto p-4 min-w-0">
                {editing?.kind === "group" ? (
                  <GroupEditor
                    initial={editing.data}
                    onCancel={() => setEditing(null)}
                    onSave={handleSaveGroup}
                  />
                ) : editing?.kind === "endpoint" ? (
                  <EndpointEditor
                    initial={editing.data}
                    groups={groups}
                    onCancel={() => setEditing(null)}
                    onSave={handleSaveEndpoint}
                  />
                ) : (
                  <div className="text-gray-400 text-xs">在左侧选择或新建</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
