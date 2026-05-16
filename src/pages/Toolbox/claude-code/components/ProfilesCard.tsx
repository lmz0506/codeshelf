import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Download,
  Edit3,
  GripVertical,
  Plus,
  Power,
  Settings,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui";
import type { ConfigProfile } from "@/types/toolbox";

interface ProfilesCardProps {
  showCurrentSettings: boolean;
  currentSettings: string;
  copiedText: string | null;
  profiles: ConfigProfile[];
  activeProfileId: string | null;
  recommendedTemplate: string | null;
  onToggleShowSettings: () => void;
  onCopy: (text: string, label: string) => void;
  onImport: () => void;
  onExport: (profile?: ConfigProfile) => void;
  onCreate: () => void;
  onEdit: (profile: ConfigProfile) => void;
  onActivate: (profile: ConfigProfile) => void;
  onSetAsTemplate: (profile: ConfigProfile) => Promise<void>;
  onRequestDelete: (profile: ConfigProfile) => void;
}

export function ProfilesCard({
  showCurrentSettings,
  currentSettings,
  copiedText,
  profiles,
  activeProfileId,
  recommendedTemplate,
  onToggleShowSettings,
  onCopy,
  onImport,
  onExport,
  onCreate,
  onEdit,
  onActivate,
  onSetAsTemplate,
  onRequestDelete,
}: ProfilesCardProps) {
  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
      <div className="re-card flex-shrink-0 overflow-hidden">
        <button
          onClick={onToggleShowSettings}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-blue-500" />
            <span className="font-semibold text-gray-900 dark:text-white text-sm">当前 settings.json</span>
          </div>
          <div className="flex items-center gap-2">
            {showCurrentSettings && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(currentSettings || "{}", "currentSettings");
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                title="复制配置"
              >
                {copiedText === "currentSettings" ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-400" />}
              </button>
            )}
            {showCurrentSettings ? (
              <ChevronDown size={16} className="text-gray-400" />
            ) : (
              <ChevronRight size={16} className="text-gray-400" />
            )}
          </div>
        </button>
        {showCurrentSettings && (
          <div className="px-3 pb-3">
            <pre className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-mono text-gray-600 dark:text-gray-400 max-h-[200px] overflow-auto whitespace-pre-wrap break-all">
              {currentSettings || "{}"}
            </pre>
          </div>
        )}
      </div>

      <div className="flex-1 re-card p-3 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
              <Copy size={16} />
              配置档案
            </h3>
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle size={12} />
              启用后需重启 Claude Code 生效
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onImport}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-blue-500"
              title="导入配置档案"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={() => onExport()}
              disabled={profiles.length === 0}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="导出全部配置档案"
            >
              <Download size={14} />
            </button>
            <Button onClick={onCreate} variant="primary" className="flex items-center gap-1 text-xs py-1 px-2">
              <Plus size={12} />
              新建
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {profiles.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Copy size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无配置档案</p>
              <p className="text-xs mt-1">点击"新建"创建第一个配置档案</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {profiles.map((profile) => {
                const isActive = activeProfileId === profile.id;
                const profileSettingsStr = (() => {
                  const s = { ...(profile.settings as Record<string, unknown>) };
                  delete s.__active;
                  return JSON.stringify(s, null, 2);
                })();
                const isTemplate = !!recommendedTemplate && profileSettingsStr === recommendedTemplate;
                return (
                  <div
                    key={profile.id}
                    onDoubleClick={() => onEdit(profile)}
                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md ${
                      isActive
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-100 dark:border-gray-800 hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <GripVertical size={16} className="text-gray-300 flex-shrink-0 mt-0.5 cursor-grab" />
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? "bg-green-500" : "bg-blue-500"
                      }`}>
                        <Settings size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white truncate text-sm">
                            {profile.name}
                          </span>
                          {isActive && (
                            <span className="text-[10px] text-green-600 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded flex-shrink-0">
                              已启用
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {profile.description || "无描述"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                      {!isActive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onActivate(profile); }}
                          className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 text-xs flex items-center gap-1"
                          title="启用"
                        >
                          <Power size={12} />
                          <span>启用</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(profile); }}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 text-xs flex items-center gap-1"
                        title="编辑"
                      >
                        <Edit3 size={12} />
                        <span>编辑</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onExport(profile); }}
                        className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-blue-500 text-xs flex items-center gap-1"
                        title="导出"
                      >
                        <Download size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetAsTemplate(profile); }}
                        className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                          isTemplate
                            ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600"
                            : "hover:bg-yellow-50 dark:hover:bg-yellow-900/20 text-yellow-600"
                        }`}
                        title={isTemplate ? "当前推荐模板" : "设为推荐模板"}
                      >
                        <Star size={12} fill={isTemplate ? "currentColor" : "none"} />
                      </button>
                      {!isActive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRequestDelete(profile); }}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500 text-xs flex items-center gap-1"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
