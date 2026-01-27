import { useState } from "react";
import { Code, Check } from "lucide-react";

// 预设的技术栈标签
const DEFAULT_LABELS = [
  { value: "Java", color: "#007396", icon: "☕" },
  { value: "Vue", color: "#42b883", icon: "🟢" },
  { value: "React", color: "#61dafb", icon: "⚛️" },
  { value: "Angular", color: "#dd0031", icon: "🅰️" },
  { value: "小程序", color: "#07c160", icon: "📱" },
  { value: "Node.js", color: "#339933", icon: "🟩" },
  { value: "Python", color: "#3776ab", icon: "🐍" },
  { value: "Go", color: "#00add8", icon: "🔵" },
  { value: "Rust", color: "#000000", icon: "🦀" },
  { value: "TypeScript", color: "#3178c6", icon: "📘" },
  { value: "JavaScript", color: "#f7df1e", icon: "📜" },
  { value: "PHP", color: "#777bb4", icon: "🐘" },
  { value: "C#", color: "#239120", icon: "#️⃣" },
  { value: "C++", color: "#00599c", icon: "➕" },
  { value: "Swift", color: "#fa7343", icon: "🍎" },
  { value: "Kotlin", color: "#7f52ff", icon: "🅺" },
  { value: "Flutter", color: "#02569b", icon: "🦋" },
  { value: "Android", color: "#3ddc84", icon: "🤖" },
  { value: "iOS", color: "#000000", icon: "📱" },
  { value: "UI设计", color: "#ff6b6b", icon: "🎨" },
  { value: "后端", color: "#4a5568", icon: "⚙️" },
  { value: "前端", color: "#ed8936", icon: "🖥️" },
  { value: "全栈", color: "#805ad5", icon: "🔄" },
  { value: "其他", color: "#718096", icon: "📦" },
];

interface LabelSelectorProps {
  selectedLabels: string[];
  onChange: (labels: string[]) => void;
  multiple?: boolean;
}

export function LabelSelector({
  selectedLabels,
  onChange,
  multiple = true,
}: LabelSelectorProps) {
  const [customLabel, setCustomLabel] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Combine default labels with custom labels
  const allLabels = [
    ...DEFAULT_LABELS,
    ...selectedLabels
      .filter((label) => !DEFAULT_LABELS.some((d) => d.value === label))
      .map((label) => ({ value: label, color: "#718096", icon: "🏷️" })),
  ];

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
      onChange([...selectedLabels, trimmed]);
    }
    setCustomLabel("");
    setShowCustomInput(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
          <Code size={16} className="text-[var(--text-light)]" />
          技术栈标签 {multiple && "(可多选)"}
        </label>
        {!showCustomInput && (
          <button
            onClick={() => setShowCustomInput(true)}
            className="text-xs text-[var(--primary)] hover:underline font-medium"
          >
            + 自定义
          </button>
        )}
      </div>

      {/* Custom Label Input */}
      {showCustomInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddCustomLabel()}
            placeholder="输入自定义标签..."
            autoFocus
            className="flex-1 px-3 py-2 text-sm bg-[var(--bg-light)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
          <button
            onClick={handleAddCustomLabel}
            className="px-3 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors text-sm font-medium"
          >
            添加
          </button>
          <button
            onClick={() => {
              setShowCustomInput(false);
              setCustomLabel("");
            }}
            className="px-3 py-2 border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--bg-light)] transition-colors text-sm"
          >
            取消
          </button>
        </div>
      )}

      {/* Label Grid */}
      <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto">
        {allLabels.map((label) => {
          const isSelected = selectedLabels.includes(label.value);
          return (
            <button
              key={label.value}
              onClick={() => toggleLabel(label.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-left ${
                isSelected
                  ? "border-[var(--primary)] bg-[var(--primary-light)]"
                  : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--bg-light)]"
              }`}
            >
              <span className="text-lg">{label.icon}</span>
              <span
                className={`text-sm font-medium truncate flex-1 ${
                  isSelected ? "text-[var(--primary)]" : "text-[var(--text)]"
                }`}
              >
                {label.value}
              </span>
              {isSelected && (
                <Check className="w-4 h-4 text-[var(--primary)] flex-shrink-0" strokeWidth={3} />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Labels */}
      {selectedLabels.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text-light)]">已选择:</span>
          {selectedLabels.map((label) => {
            const labelInfo = allLabels.find((l) => l.value === label);
            return (
              <span
                key={label}
                className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--primary-light)] text-[var(--primary)] rounded text-xs font-medium"
              >
                {labelInfo?.icon} {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
