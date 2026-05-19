import { useState } from "react";
import { X, Plus } from "lucide-react";
import type { JobDirection, Tone } from "@/types/resume";

const JOB_OPTIONS: Array<{ id: JobDirection; name: string; description: string }> = [
  { id: "backend", name: "后端开发", description: "架构 / 数据库 / API / 并发 / 工程化" },
  { id: "frontend", name: "前端开发", description: "组件化 / 性能 / 体验 / 跨端" },
  { id: "fullstack", name: "全栈开发", description: "端到端 / 技术选型 / DevOps" },
];

const TONE_OPTIONS: Array<{ id: Tone; name: string; description: string }> = [
  { id: "professional", name: "专业", description: "正式术语、完整句式" },
  { id: "concise", name: "简洁", description: "短句要点化、信息密度高" },
];

interface JobConfigPanelProps {
  jobDirection: JobDirection;
  onJobDirectionChange: (d: JobDirection) => void;
  jdKeywords: string[];
  onJdKeywordsChange: (kws: string[]) => void;
  tone: Tone;
  onToneChange: (t: Tone) => void;
}

export function JobConfigPanel({
  jobDirection,
  onJobDirectionChange,
  jdKeywords,
  onJdKeywordsChange,
  tone,
  onToneChange,
}: JobConfigPanelProps) {
  const [input, setInput] = useState("");

  const addKeyword = () => {
    const v = input.trim();
    if (!v) return;
    if (jdKeywords.includes(v)) {
      setInput("");
      return;
    }
    onJdKeywordsChange([...jdKeywords, v]);
    setInput("");
  };

  const removeKeyword = (kw: string) => {
    onJdKeywordsChange(jdKeywords.filter((k) => k !== kw));
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-2">岗位方向</h3>
        <div className="grid grid-cols-3 gap-2">
          {JOB_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onJobDirectionChange(opt.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                jobDirection === opt.id
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="font-medium text-gray-900 text-sm">{opt.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-2">语气</h3>
        <div className="grid grid-cols-2 gap-2">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onToneChange(opt.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                tone === opt.id
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="font-medium text-gray-900 text-sm">{opt.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-2">
          JD 关键词
          <span className="ml-2 text-xs text-gray-400 font-normal">
            可选；Agent 会优先把命中的关键词写进 action 字段
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder="输入关键词后回车，如 TypeScript / 微服务 / 高并发"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addKeyword}
            disabled={!input.trim()}
            className="px-3 py-2 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus size={14} /> 添加
          </button>
        </div>
        {jdKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {jdKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
              >
                {kw}
                <button
                  onClick={() => removeKeyword(kw)}
                  className="text-blue-400 hover:text-blue-600"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
