import { useEffect, useState } from "react";
import type { ApiAuthConfig, ApiGroup } from "@/types";
import { AuthEditor } from "./AuthEditor";

interface GroupEditorProps {
  initial?: ApiGroup;
  onCancel: () => void;
  onSave: (group: ApiGroup) => Promise<void> | void;
}

function blank(): ApiGroup {
  return {
    id: "",
    name: "",
    description: "",
    baseUrl: "",
    auth: { type: "none" },
    createdAt: "",
    updatedAt: "",
  };
}

export function GroupEditor({ initial, onCancel, onSave }: GroupEditorProps) {
  const [group, setGroup] = useState<ApiGroup>(initial ?? blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGroup(initial ?? blank());
  }, [initial]);

  async function submit() {
    if (!group.name.trim() || !group.baseUrl.trim()) {
      alert("名称和 baseUrl 必填");
      return;
    }
    setSaving(true);
    try {
      await onSave(group);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-600 w-16">名称</span>
        <input
          className="flex-1 px-2 py-1 border border-gray-200 rounded"
          value={group.name}
          onChange={(e) => setGroup({ ...group, name: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600 w-16">baseUrl</span>
        <input
          className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
          placeholder="https://api.example.com"
          value={group.baseUrl}
          onChange={(e) => setGroup({ ...group, baseUrl: e.target.value })}
        />
      </div>
      <div className="flex items-start gap-2">
        <span className="text-gray-600 w-16 mt-1">描述</span>
        <textarea
          rows={2}
          className="flex-1 px-2 py-1 border border-gray-200 rounded"
          value={group.description ?? ""}
          onChange={(e) => setGroup({ ...group, description: e.target.value })}
        />
      </div>
      <div>
        <div className="text-gray-600 mb-1">鉴权（本组内所有接口默认共用）</div>
        <AuthEditor
          value={group.auth}
          onChange={(auth: ApiAuthConfig) => setGroup({ ...group, auth })}
        />
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
