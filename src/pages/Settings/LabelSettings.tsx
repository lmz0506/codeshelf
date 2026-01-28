import { useState } from "react";
import { Plus, X, Tag } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { showToast } from "@/components/ui";

interface LabelSettingsProps {
  onClose?: () => void;
}

// Predefined labels for quick selection
const PRESET_LABELS = [
  { name: "Java", color: "bg-orange-100 text-orange-700" },
  { name: "Python", color: "bg-blue-100 text-blue-700" },
  { name: "JavaScript", color: "bg-yellow-100 text-yellow-700" },
  { name: "TypeScript", color: "bg-blue-100 text-blue-700" },
  { name: "React", color: "bg-cyan-100 text-cyan-700" },
  { name: "Vue", color: "bg-green-100 text-green-700" },
  { name: "Node.js", color: "bg-green-100 text-green-700" },
  { name: "Go", color: "bg-cyan-100 text-cyan-700" },
  { name: "Rust", color: "bg-orange-100 text-orange-700" },
  { name: "Spring Boot", color: "bg-green-100 text-green-700" },
  { name: "Docker", color: "bg-blue-100 text-blue-700" },
  { name: "Kubernetes", color: "bg-blue-100 text-blue-700" },
  { name: "小程序", color: "bg-green-100 text-green-700" },
];

export function LabelSettings({ onClose }: LabelSettingsProps) {
  const { labels, addLabel, removeLabel } = useAppStore();
  const [newLabel, setNewLabel] = useState("");

  function handleAddLabel() {
    if (!newLabel.trim()) return;
    if (labels.includes(newLabel.trim())) {
      showToast("warning", "标签已存在", `"${newLabel.trim()}" 已在列表中`);
      return;
    }
    addLabel(newLabel.trim());
    setNewLabel("");
    showToast("success", "添加成功", `已添加标签 "${newLabel.trim()}"`);
  }

  function handleRemoveLabel(label: string) {
    removeLabel(label);
    showToast("success", "删除成功", `已删除标签 "${label}"`);
  }

  function handleAddPreset(presetName: string) {
    if (labels.includes(presetName)) {
      showToast("warning", "标签已存在", `"${presetName}" 已在列表中`);
      return;
    }
    addLabel(presetName);
    showToast("success", "添加成功", `已添加标签 "${presetName}"`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">管理技术栈标签</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            管理项目的技术栈标签，用于标识项目使用的技术
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-blue-500 transition-colors"
          >
            收起
          </button>
        )}
      </div>

      {/* Add New Label */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">添加新标签</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="输入标签名称..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddLabel();
              }
            }}
          />
          <button
            onClick={handleAddLabel}
            disabled={!newLabel.trim()}
            className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            添加
          </button>
        </div>
      </div>

      {/* Current Labels */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          当前标签 ({labels.length})
        </label>
        {labels.length > 0 ? (
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg min-h-[60px]">
            {labels.map((label) => (
              <div
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 group hover:border-blue-300 transition-colors"
              >
                <Tag size={14} className="text-gray-400" />
                <span>{label}</span>
                <button
                  onClick={() => handleRemoveLabel(label)}
                  className="ml-1 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  title="删除标签"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-gray-50 rounded-lg text-center">
            <Tag size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">暂无标签</p>
            <p className="text-xs text-gray-400 mt-1">添加标签来标识项目技术栈</p>
          </div>
        )}
      </div>

      {/* Preset Labels */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">快速添加预设标签</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_LABELS.map((preset) => {
            const isAdded = labels.includes(preset.name);
            return (
              <button
                key={preset.name}
                onClick={() => handleAddPreset(preset.name)}
                disabled={isAdded}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                  isAdded
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : `${preset.color} hover:ring-2 hover:ring-offset-1 hover:ring-blue-400`
                }`}
              >
                {preset.name}
                {isAdded && " ✓"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tips */}
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-700">
          <strong>提示：</strong>技术栈标签用于标识项目使用的技术框架。在添加或编辑项目时新增的标签会自动同步到这里。
        </p>
      </div>
    </div>
  );
}
