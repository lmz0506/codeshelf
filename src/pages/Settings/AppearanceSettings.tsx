import { Sun, Moon, Monitor, Dock } from "lucide-react";
import { useSettingsStore, type Theme } from "@/stores/settingsStore";
import { IS_MAC } from "@/utils/platform";

interface AppearanceSettingsProps {
  onClose?: () => void;
}

export function AppearanceSettings({ onClose }: AppearanceSettingsProps) {
  const { theme, setTheme, showDockIcon, setShowDockIcon } = useSettingsStore();

  const themes = [
    { value: "light" as Theme, label: "浅色", icon: Sun, description: "明亮的界面主题" },
    { value: "dark" as Theme, label: "深色", icon: Moon, description: "暗色界面主题" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900">选择主题模式</h4>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-blue-500 transition-colors"
          >
            收起
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {themes.map(({ value, label, icon: Icon, description }) => {
          const isSelected = value === theme;
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-500/50 hover:bg-gray-50"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  isSelected ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div className="text-center">
                <div
                  className={`font-semibold ${
                    isSelected ? "text-blue-500" : "text-gray-900"
                  }`}
                >
                  {label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{description}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2 p-3 bg-gray-100 rounded-lg">
        <Monitor className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500">
          主题设置会自动保存并应用到整个应用程序。选择适合您工作环境的主题模式。
        </p>
      </div>

      {IS_MAC && (
        <div className="pt-3 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">macOS 选项</h4>
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-500/40 transition-colors">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
                <Dock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">在 Dock 显示图标</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  开启后可在 Dock 点击图标唤起窗口，避免菜单栏图标被挤掉后无入口。
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowDockIcon(!showDockIcon)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${
                showDockIcon ? "bg-blue-500" : "bg-gray-300"
              }`}
              title={showDockIcon ? "已开启" : "已关闭"}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  showDockIcon ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
