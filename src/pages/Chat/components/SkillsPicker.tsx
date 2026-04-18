import { useEffect, useMemo, useState } from "react";
import { X, BookMarked } from "lucide-react";
import { listSkills, type Skill } from "@/services/chat";

interface SkillsPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (rendered: string) => void;
}

export function SkillsPicker({ open, onClose, onSelect }: SkillsPickerProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [args, setArgs] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    listSkills().then(setSkills).catch(() => setSkills([]));
    setSelected(null);
    setArgs("");
    setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [skills, query]);

  if (!open) return null;

  function render(skill: Skill, argsVal: string): string {
    return skill.body.replace(/\{args\}/g, argsVal);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[720px] max-w-[92vw] h-[70vh] flex overflow-hidden">
        <div className="w-64 border-r border-gray-200 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
            <BookMarked size={14} className="text-blue-500" />
            <input
              className="flex-1 text-xs outline-none"
              placeholder="搜索 skill..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.map((s) => (
              <button
                key={s.name}
                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-50 ${selected?.name === s.name ? "bg-blue-50" : ""}`}
                onClick={() => {
                  setSelected(s);
                  setArgs("");
                }}
              >
                <div className="font-mono text-blue-700 text-xs">/{s.name}</div>
                <div className="text-[11px] text-gray-500 truncate">{s.description}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-gray-400">无匹配</div>}
          </div>
        </div>
        <div className="flex-1 flex flex-col p-4 space-y-3">
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              选择左侧 skill 查看详情
            </div>
          )}
          {selected && (
            <>
              <div className="space-y-1">
                <div className="font-semibold">{selected.name}</div>
                <div className="text-xs text-gray-500">{selected.description}</div>
              </div>
              {selected.argsHint && (
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder={`参数：${selected.argsHint}`}
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  autoFocus
                />
              )}
              <div className="text-[11px] text-gray-400">渲染后的 prompt 预览</div>
              <pre className="flex-1 overflow-auto bg-gray-50 border border-gray-200 rounded p-2 text-xs font-mono whitespace-pre-wrap">
                {render(selected, args)}
              </pre>
              <div className="flex justify-end gap-2">
                <button className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg" onClick={onClose}>
                  取消
                </button>
                <button
                  className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg"
                  onClick={() => {
                    onSelect(render(selected, args));
                    onClose();
                  }}
                >
                  插入到输入框
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
