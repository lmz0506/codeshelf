import { Edit3, FileText, Lock } from "lucide-react";
import type { ConfigFileInfo } from "@/types/toolbox";
import { READONLY_FILES, EDITABLE_FILES } from "../constants";

interface ConfigFilesListProps {
  files: ConfigFileInfo[];
  selectedFile: ConfigFileInfo | null;
  onSelect: (file: ConfigFileInfo) => void;
}

export function ConfigFilesList({ files, selectedFile, onSelect }: ConfigFilesListProps) {
  return (
    <div className="w-40 flex-shrink-0 re-card p-3 flex flex-col">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm flex-shrink-0">配置文件</h3>
      <div className="flex-1 overflow-y-auto space-y-1">
        {files.map((file) => {
          const isReadonly = READONLY_FILES.includes(file.name);
          const isEditable = EDITABLE_FILES.includes(file.name);
          return (
            <div key={file.path} className="group relative">
              <button
                onClick={() => onSelect(file)}
                title={`${file.name}\n${file.description || "配置文件"}${file.exists && file.size !== undefined ? `\n大小: ${(file.size / 1024).toFixed(1)} KB` : ""}`}
                className={`w-full text-left p-2 rounded-lg border transition-colors ${
                  selectedFile?.path === file.path
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isReadonly ? (
                    <Lock size={12} className="text-gray-400 flex-shrink-0" />
                  ) : isEditable ? (
                    <Edit3 size={12} className="text-blue-500 flex-shrink-0" />
                  ) : (
                    <FileText size={12} className={`flex-shrink-0 ${file.exists ? "text-blue-500" : "text-gray-400"}`} />
                  )}
                  <span className={`font-medium text-xs truncate ${file.exists ? "" : "text-gray-400"}`}>
                    {file.name}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
