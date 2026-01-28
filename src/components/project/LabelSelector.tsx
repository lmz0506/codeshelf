import { useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

interface LabelSelectorProps {
  selectedLabels: string[];
  onChange: (labels: string[]) => void;
  multiple?: boolean;
}

// 获取标签图标
function getLabelIcon(label: string) {
  const iconMap: Record<string, { bg: string; text: string; round?: boolean }> = {
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

  const config = iconMap[label] || { bg: "bg-gray-600", text: label.slice(0, 2) };

  return (
    <div className={`w-6 h-6 ${config.round ? 'rounded-full' : 'rounded'} ${config.bg} flex items-center justify-center`}>
      <span className="text-white text-xs font-medium">{config.text}</span>
    </div>
  );
}

export function LabelSelector({
  selectedLabels,
  onChange,
  multiple = true,
}: LabelSelectorProps) {
  const { labels: storeLabels, addLabel } = useAppStore();
  const [customLabel, setCustomLabel] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // 合并 store 中的标签和已选标签（去重）
  const allLabels = Array.from(new Set([...storeLabels, ...selectedLabels]));

  function toggleLabel(label: string) {
    if (multiple) {
      if (selectedLabels.includes(label)) {
        onChange(selectedLabels.filter((l) => l !== label));
      } else {
        onChange([...selectedLabels, label]);
      }
    } else {
      onChange([label]);
    }
  }

  function handleAddCustomLabel() {
    const trimmed = customLabel.trim();
    if (trimmed && !selectedLabels.includes(trimmed)) {
      // 同时添加到 store
      addLabel(trimmed);
      onChange([...selectedLabels, trimmed]);
    }
    setCustomLabel("");
    setShowCustomInput(false);
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          技术栈标签（可多选）
          <span className="text-xs text-gray-400 font-normal">帮助快速识别项目类型</span>
        </label>
        {!showCustomInput && (
          <button
            onClick={() => setShowCustomInput(true)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:gap-1.5 transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            自定义
          </button>
        )}
      </div>

      {/* Custom Label Input */}
      {showCustomInput && (
        <div className="flex gap-2 animate-in slide-in-from-top-1">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCustomLabel()}
            placeholder="输入自定义标签..."
            autoFocus
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 input-focus"
          />
          <button
            onClick={handleAddCustomLabel}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            添加
          </button>
          <button
            onClick={() => {
              setShowCustomInput(false);
              setCustomLabel("");
            }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Label Grid */}
      <div className="grid grid-cols-3 gap-2">
        {allLabels.map((label) => {
          const isSelected = selectedLabels.includes(label);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleLabel(label)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left ${
                isSelected
                  ? "bg-blue-50 border-2 border-blue-500"
                  : "bg-gray-50 border-2 border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="w-6 h-6 flex items-center justify-center">
                {getLabelIcon(label)}
              </div>
              <span className={`text-sm font-medium ${isSelected ? "text-blue-700" : "text-gray-700"}`}>
                {label}
              </span>
              {isSelected && <span className="ml-auto text-blue-500">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
