import { useState } from "react";
import { Plus, Trash2, FolderOpen, AlertCircle, Check, X } from "lucide-react";
import { useAppStore, EditorConfig } from "@/stores/appStore";
import { open } from "@tauri-apps/plugin-dialog";

interface EditorSettingsProps {
  onClose?: () => void;
}

export function EditorSettings({ onClose }: EditorSettingsProps) {
  const { editors, addEditor, removeEditor } = useAppStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEditor, setNewEditor] = useState({ name: "", path: "" });

  async function handleBrowsePath() {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: "选择编辑器可执行文件",
      });

      if (selected) {
        setNewEditor({ ...newEditor, path: selected as string });
      }
    } catch (error) {
      console.error("Failed to select file:", error);
    }
  }

  function handleAddEditor() {
    if (!newEditor.name.trim() || !newEditor.path.trim()) {
      alert("请填写编辑器名称和路径");
      return;
    }

    const editor: EditorConfig = {
      id: Date.now().toString(),
      name: newEditor.name.trim(),
      path: newEditor.path.trim(),
    };

    addEditor(editor);
    setNewEditor({ name: "", path: "" });
    setShowAddForm(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <h4 className="text-sm font-semibold text-[var(--text)]">编辑器配置</h4>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-light)] hover:text-[var(--primary)] transition-colors"
          >
            收起
          </button>
        )}
      </div>

      {/* 说明文档 */}
      <div className="p-3 bg-blue-50/50 border border-blue-200/50 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900 space-y-1">
            <p className="font-medium">配置说明</p>
            <p>• Windows: 选择编辑器的 .exe 文件</p>
            <p>• macOS: 选择应用程序包内的可执行文件</p>
            <p>• 第一个配置的编辑器将被设为默认</p>
          </div>
        </div>
      </div>

      {/* 编辑器列表 */}
      <div className="space-y-2">
        {editors.length === 0 ? (
          <div className="text-center py-6 text-[var(--text-light)] border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-light)]">
            <div className="text-sm font-medium">暂无配置的编辑器</div>
            <div className="text-xs mt-1">点击下方按钮添加</div>
          </div>
        ) : (
          editors.map((editor, index) => (
            <div
              key={editor.id}
              className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg hover:border-[var(--primary)]/50 transition-colors bg-[var(--card)]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text)] text-sm">{editor.name}</span>
                  {index === 0 && (
                    <span className="px-2 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)] text-xs rounded-full font-medium">
                      默认
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-light)] font-mono truncate mt-0.5">
                  {editor.path}
                </div>
              </div>
              <button
                onClick={() => removeEditor(editor.id)}
                className="ml-3 p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 添加编辑器表单 */}
      {showAddForm ? (
        <div className="p-4 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text)] mb-1.5">
              编辑器名称
            </label>
            <input
              type="text"
              value={newEditor.name}
              onChange={(e) => setNewEditor({ ...newEditor, name: e.target.value })}
              placeholder="例如：VS Code、IntelliJ IDEA"
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text)] mb-1.5">
              可执行文件路径
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEditor.path}
                onChange={(e) => setNewEditor({ ...newEditor, path: e.target.value })}
                placeholder="选择或输入编辑器可执行文件路径"
                className="flex-1 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--text)] placeholder-[var(--text-light)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
              <button
                onClick={handleBrowsePath}
                className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-lg text-sm hover:bg-[var(--bg-light)] transition-colors flex items-center gap-1.5"
              >
                <FolderOpen size={14} />
                浏览
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAddEditor}
              className="flex-1 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
            >
              <Check size={14} />
              确认添加
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewEditor({ name: "", path: "" });
              }}
              className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-lg text-sm font-medium hover:bg-[var(--bg-light)] transition-colors flex items-center gap-1.5"
            >
              <X size={14} />
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2.5 border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] text-[var(--text-light)] hover:text-[var(--primary)] rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          添加编辑器
        </button>
      )}
    </div>
  );
}
