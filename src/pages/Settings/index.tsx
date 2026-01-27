import { Input } from "@/components/ui";
import { useAppStore, Theme } from "@/stores/appStore";
import { Sun, Moon } from "lucide-react";

export function SettingsPage() {
  const { theme, setTheme } = useAppStore();

  return (
    <div className="flex flex-col h-full p-8 max-w-2xl">
      <h1 className="text-[var(--color-text-primary)] mb-8">设置</h1>

      {/* Theme Settings */}
      <section className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-[var(--color-text-primary)] mb-5">外观</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-3">
              主题模式
            </label>
            <div className="flex gap-3">
              <ThemeOption
                icon={Sun}
                label="浅色"
                value="light"
                currentValue={theme}
                onChange={setTheme}
              />
              <ThemeOption
                icon={Moon}
                label="深色"
                value="dark"
                currentValue={theme}
                onChange={setTheme}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Editor Settings */}
      <section className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-[var(--color-text-primary)] mb-5">编辑器设置</h2>
        <div className="space-y-4">
          <Input
            label="默认编辑器命令"
            placeholder="code"
            defaultValue="code"
          />
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            支持 VSCode (code)、IDEA (idea)、Sublime Text (subl) 等
          </p>
        </div>
      </section>

      {/* Scan Settings */}
      <section className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-[var(--color-text-primary)] mb-5">扫描设置</h2>
        <div className="space-y-4">
          <Input
            label="扫描深度"
            type="number"
            placeholder="3"
            defaultValue="3"
            min={1}
            max={10}
          />
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            扫描目录时的最大递归深度
          </p>
        </div>
      </section>

      {/* About */}
      <section className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-6 shadow-sm">
        <h2 className="text-[var(--color-text-primary)] mb-5">关于</h2>
        <div className="text-[var(--color-text-secondary)] space-y-2">
          <p className="font-medium">CodeShelf v0.1.0</p>
          <p>代码书架 - 本地项目管理工具</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            基于 Tauri + React + TypeScript 构建
          </p>
        </div>
      </section>
    </div>
  );
}

interface ThemeOptionProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: Theme;
  currentValue: Theme;
  onChange: (value: Theme) => void;
}

function ThemeOption({ icon: Icon, label, value, currentValue, onChange }: ThemeOptionProps) {
  const isSelected = value === currentValue;

  return (
    <button
      onClick={() => onChange(value)}
      className={`flex items-center gap-3 px-5 py-3 rounded-lg border-2 transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </button>
  );
}
