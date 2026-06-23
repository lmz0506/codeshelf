// 快捷键备忘的三个弹窗：添加 / 删除确认 / 重置确认。
// AddDialog 自己持有表单状态，提交时把整理好的字段交给 parent；
// Delete/Reset 都是纯展示 + 回调。

import { useState } from "react";
import { Button } from "@/components/ui";
import {
  KeyRecorderInput,
  renderKeys,
  type Platform,
} from "./ShortcutsKeyRecorder";
import type { ShortcutEntry } from "@/types/toolbox";

interface AddDialogProps {
  platform: Platform;
  existingCustomCategories: string[];
  onClose: () => void;
  onSubmit: (params: { category: string; description: string; keys: string }) => void;
}

export function ShortcutAddDialog({
  platform,
  existingCustomCategories,
  onClose,
  onSubmit,
}: AddDialogProps) {
  const [newDesc, setNewDesc] = useState("");
  const [newKeys, setNewKeys] = useState("");
  const [newCategory, setNewCategory] = useState("__new__");
  const [newCategoryName, setNewCategoryName] = useState("");

  const addDisabled =
    !newDesc.trim() ||
    !newKeys.trim() ||
    (newCategory === "__new__" && !newCategoryName.trim());

  function handleSubmit() {
    if (addDisabled) return;
    const actualCategory =
      newCategory === "__new__" ? newCategoryName.trim() : newCategory;
    if (!actualCategory) return;
    onSubmit({
      category: actualCategory,
      description: newDesc.trim(),
      keys: newKeys.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="re-card w-[420px] p-5 mx-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          添加快捷键
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-500 mb-1">分类</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="system">系统</option>
              <option value="vscode">VS Code</option>
              <option value="idea">IDEA</option>
              {existingCustomCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="__new__">+ 新建分类...</option>
            </select>
          </div>

          {newCategory === "__new__" && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                分类名称
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="输入自定义分类名称"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-500 mb-1">功能描述</label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="例如：打开终端"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">
              按键组合
              <span className="text-gray-400 ml-1 font-normal">
                (手动输入或点击右侧图标录入)
              </span>
            </label>
            <KeyRecorderInput
              value={newKeys}
              onChange={setNewKeys}
              platform={platform}
              placeholder="例如：Ctrl + Shift + T"
              className="[&_input]:!px-3 [&_input]:!py-2 [&_input]:!rounded-lg [&_input]:!border-gray-200 [&_input]:dark:!border-gray-700"
            />
          </div>

          <div className="text-xs text-gray-400">
            平台：{platform === "mac" ? "Mac" : "Windows"}（跟随当前选择）
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={addDisabled}
          >
            添加
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DeleteDialogProps {
  entry: ShortcutEntry;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ShortcutDeleteConfirmDialog({
  entry,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="re-card w-[380px] p-5 mx-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
          删除快捷键
        </h3>
        <p className="text-sm text-gray-500 mb-1">确定要删除以下快捷键吗？</p>
        <div className="flex items-center gap-2 py-2 px-3 my-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
            {entry.description}
          </span>
          <span className="text-gray-400 mx-1">-</span>
          {renderKeys(entry.keys)}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            确认删除
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ResetDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export function ShortcutResetConfirmDialog({
  onCancel,
  onConfirm,
}: ResetDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="re-card w-[380px] p-5 mx-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
          重置快捷键
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          恢复所有默认快捷键到初始状态，保留您的自定义快捷键。确定要继续吗？
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            确认重置
          </Button>
        </div>
      </div>
    </div>
  );
}
