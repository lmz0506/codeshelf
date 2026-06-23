import { useEffect } from "react";
import type { SlashCommand } from "../utils/slashCommands";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  highlightedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
}

export function SlashCommandMenu({ commands, highlightedIndex, onSelect, onHover }: SlashCommandMenuProps) {
  useEffect(() => {
    const el = document.getElementById(`slash-cmd-${highlightedIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  if (commands.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-400">
        无匹配命令
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
      {commands.map((cmd, idx) => (
        <div
          id={`slash-cmd-${idx}`}
          key={cmd.id}
          className={`flex flex-col gap-0.5 px-3 py-2 cursor-pointer ${idx === highlightedIndex ? "bg-blue-50" : "hover:bg-gray-50"}`}
          onMouseEnter={() => onHover(idx)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
        >
          <div className="text-sm font-mono text-gray-800">{cmd.name}</div>
          <div className="text-[11px] text-gray-500">{cmd.description}</div>
        </div>
      ))}
    </div>
  );
}
