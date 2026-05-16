import { BookOpen, Edit3, FileText, Info, Loader2, Lock, Save } from "lucide-react";
import { LoadingSpinner } from "@/components/common";
import type { ConfigFileInfo } from "@/types/toolbox";
import { CONFIG_REFERENCES, EDITABLE_FILES, READONLY_FILES } from "../constants";

interface FileViewerCardProps {
  file: ConfigFileInfo;
  fileContent: string;
  editingContent: string;
  isEditing: boolean;
  loading: boolean;
  saving: boolean;
  onEditingContentChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onOpenConfigReference: () => void;
}

export function FileViewerCard({
  file,
  fileContent,
  editingContent,
  isEditing,
  loading,
  saving,
  onEditingContentChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  onOpenConfigReference,
}: FileViewerCardProps) {
  const isReadonly = READONLY_FILES.includes(file.name);
  const isEditable = EDITABLE_FILES.includes(file.name);
  const hasConfigReference = Boolean(CONFIG_REFERENCES[file.name]);

  return (
    <div className="flex-1 re-card p-3 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        {isReadonly ? (
          <Lock size={14} className="text-gray-400" />
        ) : (
          <FileText size={14} className="text-blue-500" />
        )}
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{file.name}</h3>
        {isReadonly ? (
          <span className="text-xs text-gray-400">只读</span>
        ) : (
          <span className="text-xs text-blue-500">可编辑</span>
        )}
        <div className="flex-1" />

        {hasConfigReference && (
          <button
            onClick={onOpenConfigReference}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
          >
            <BookOpen size={12} />
            <span>配置参考</span>
          </button>
        )}

        {isEditable && !isReadonly && (
          isEditing ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onCancelEdit}
                className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                取消
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="flex items-center gap-1 px-2 py-1 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                <span>保存</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onStartEdit}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <Edit3 size={12} />
              <span>编辑</span>
            </button>
          )
        )}

        <div className="group relative">
          <Info size={14} className="text-gray-400 cursor-help" />
          <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block pointer-events-none">
            <div className="bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg max-w-[250px] whitespace-normal">
              {file.description || "配置文件"}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <LoadingSpinner size={24} />
        </div>
      ) : isEditing ? (
        <textarea
          value={editingContent}
          onChange={(e) => onEditingContentChange(e.target.value)}
          className="flex-1 p-3 font-mono text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="输入配置内容..."
        />
      ) : (
        <pre className="flex-1 p-3 font-mono text-xs bg-gray-50 dark:bg-gray-800 rounded-lg overflow-auto text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
          {fileContent}
        </pre>
      )}
    </div>
  );
}
