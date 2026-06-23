import { BookOpen, Check, Copy, Power, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Modal } from "@/components/common/Modal";
import { CONFIG_REFERENCES } from "../constants";
import type { ConfigProfile } from "@/types/toolbox";

interface ActivateConfirmDialogProps {
  profile: ConfigProfile;
  activating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ActivateConfirmDialog({ profile, activating, onCancel, onConfirm }: ActivateConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={true}
      title="确认启用"
      icon={Power}
      variant="primary"
      confirmLabel={activating ? "启用中..." : "启用"}
      loading={activating}
      description={
        <>
          <p className="mb-2">
            确定要启用配置档案 <span className="font-medium text-gray-900 dark:text-white">"{profile.name}"</span> 吗？
          </p>
          <p className="text-xs text-gray-500">
            这将把该档案的配置写入到当前环境的 settings.json 文件中。
          </p>
        </>
      }
      notice={
        <span>
          <strong>注意：</strong>配置修改后需要重启 Claude Code 才能生效。
          请退出当前会话后重新运行 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">claude</code> 命令。
        </span>
      }
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

interface DeleteConfirmDialogProps {
  profile: ConfigProfile;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({ profile, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={true}
      title="确认删除"
      icon={Trash2}
      variant="danger"
      confirmLabel="删除"
      description={
        <>
          确定要删除配置档案 <span className="font-medium text-gray-900 dark:text-white">"{profile.name}"</span> 吗？此操作无法撤销。
        </>
      }
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

interface ConfigReferenceDialogProps {
  fileName: string;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
  onClose: () => void;
}

export function ConfigReferenceDialog({ fileName, copiedText, onCopy, onClose }: ConfigReferenceDialogProps) {
  const ref = CONFIG_REFERENCES[fileName];
  if (!ref) return null;
  return (
    <Modal open={true} onClose={onClose} size="xl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen size={20} />
            {ref.title}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {ref.sections.map((section, index) => (
            <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800">
                <h4 className="font-medium text-gray-900 dark:text-white">{section.name}</h4>
                <p className="text-sm text-gray-500 mt-0.5">{section.description}</p>
              </div>
              {section.example && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">示例:</span>
                    <button
                      onClick={() => onCopy(section.example!, `example-${index}`)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      title="复制示例"
                    >
                      {copiedText === `example-${index}` ? (
                        <Check size={12} className="text-green-500" />
                      ) : (
                        <Copy size={12} className="text-gray-400" />
                      )}
                    </button>
                  </div>
                  <pre className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {section.example}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose} variant="secondary">关闭</Button>
        </div>
      </div>
    </Modal>
  );
}
