import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { showToast } from "@/components/ui";

interface LabelSettingsProps {
  onClose?: () => void;
}

// 获取标签图标配置
const LABEL_ICONS: Record<string, { bg: string; text: string; round?: boolean }> = {
  "Java": { bg: "bg-orange-600", text: "J" },
  "Vue": { bg: "bg-green-500", text: "V", round: true },
  "React": { bg: "bg-blue-400", text: "⚛", round: true },
  "Angular": { bg: "bg-red-500", text: "A", round: true },
  "小程序": { bg: "bg-green-600", text: "微" },
  "Node.js": { bg: "bg-green-500", text: "N" },
  "Python": { bg: "bg-blue-500", text: "P", round: true },
  "Go": { bg: "bg-cyan-500", text: "G", round: true },
  "Rust": { bg: "bg-orange-700", text: "R", round: true },
  "TypeScript": { bg: "bg-blue-600", text: "TS" },
  "JavaScript": { bg: "bg-yellow-400", text: "JS" },
  "PHP": { bg: "bg-indigo-500", text: "P" },
  "Spring Boot": { bg: "bg-green-600", text: "S" },
  "Docker": { bg: "bg-blue-500", text: "D" },
  "Kubernetes": { bg: "bg-blue-600", text: "K8" },
};

function getLabelIcon(label: string) {
  const config = LABEL_ICONS[label] || { bg: "bg-gray-500", text: label.slice(0, 2) };
  return (
    <div className={`w-5 h-5 ${config.round ? 'rounded-full' : 'rounded'} ${config.bg} flex items-center justify-center flex-shrink-0`}>
      <span className="text-white text-xs font-medium">{config.text}</span>
    </div>
  );
}

// Predefined labels for quick selection
const PRESET_LABELS = [
  "Java", "Python", "JavaScript", "TypeScript", "React", "Vue",
  "Node.js", "Go", "Rust", "Spring Boot", "Docker", "Kubernetes", "小程序", "Angular", "PHP"
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
          <h4 className="text-sm font-semibold text-gray-900">标签管理</h4>
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
                className="inline-flex items-center gap-1.5 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 group hover:border-blue-300 transition-colors"
              >
                {getLabelIcon(label)}
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
            <div className="w-12 h-12 mx-auto mb-2 bg-gray-200 rounded-lg flex items-center justify-center">
              <span className="text-gray-400 text-lg">🏷️</span>
            </div>
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
            const isAdded = labels.includes(preset);
            return (
              <button
                key={preset}
                onClick={() => handleAddPreset(preset)}
                disabled={isAdded}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  isAdded
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white border border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                {getLabelIcon(preset)}
                <span>{preset}</span>
                {isAdded && <span className="text-green-500">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tips */}
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-700">
          <strong>提示：</strong>这里管理的标签会在添加项目和编辑项目时作为可选标签显示。在那里新增的标签也会自动同步到这里。
        </p>
      </div>
    </div>
  );
}
