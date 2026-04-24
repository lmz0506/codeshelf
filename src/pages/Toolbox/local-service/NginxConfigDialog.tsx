import { useRef } from "react";
import { Check, Copy, Download, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { NginxPreviewState } from "./types";
import { NGINX_SNIPPETS } from "./nginxSnippets";

interface NginxConfigDialogProps {
  preview: NginxPreviewState;
  copiedId: string | null;
  onChange: (preview: NginxPreviewState) => void;
  onClose: () => void;
  onCopyConfig: () => void;
  onSaveConfig: () => void;
  onCopySnippet: (code: string) => void;
}

export function NginxConfigDialog({
  preview,
  copiedId,
  onChange,
  onClose,
  onCopyConfig,
  onSaveConfig,
  onCopySnippet,
}: NginxConfigDialogProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewKey = preview.server?.id ?? "manual";
  const title = preview.title ?? "Nginx 配置";
  const subtitle = preview.subtitle ?? (
    preview.server
      ? `${preview.server.name} · :${preview.server.port} · ${preview.server.urlPrefix}`
      : "nginx 配置手册"
  );

  function insertSnippet(code: string) {
    const editor = editorRef.current;
    const snippet = `\n\n${code}\n`;
    if (!editor) {
      onChange({ ...preview, content: `${preview.content}${snippet}` });
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const nextContent = `${preview.content.slice(0, start)}${snippet}${preview.content.slice(end)}`;
    onChange({ ...preview, content: nextContent });

    requestAnimationFrame(() => {
      editor.focus();
      const pos = start + snippet.length;
      editor.setSelectionRange(pos, pos);
    });
  }

  const categories = Array.from(new Set(NGINX_SNIPPETS.map((snippet) => snippet.category)));

  return (
    <div className="fixed inset-0 top-8 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl mx-4 p-6 h-[88vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[360px_minmax(0,1fr)] gap-4">
          <div className="min-h-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">nginx 常用配置</div>
              <div className="text-xs text-gray-400 mt-0.5">展开查看完整片段，支持插入或复制</div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 pb-5 space-y-3">
              {categories.map((category) => (
                <div key={category} className="space-y-1.5">
                  <div className="px-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    {category}
                  </div>
                  {NGINX_SNIPPETS.filter((snippet) => snippet.category === category).map((snippet) => (
                    <details
                      key={`${category}-${snippet.title}`}
                      className="group border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/60 overflow-hidden"
                    >
                      <summary className="list-none cursor-pointer px-3 py-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white break-words">
                            {snippet.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">
                            {snippet.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              insertSnippet(snippet.code);
                            }}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="插入到配置"
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              onCopySnippet(snippet.code);
                            }}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="复制片段"
                          >
                            {copiedId === `nginx-snippet-${snippet.code}` ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </summary>
                      <pre className="mx-3 mb-3 max-h-56 overflow-auto rounded bg-white dark:bg-gray-950 px-3 py-2 text-[10px] leading-4 text-gray-600 dark:text-gray-300 font-mono whitespace-pre">
                        {snippet.code}
                      </pre>
                    </details>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <textarea
            ref={editorRef}
            value={preview.content}
            onChange={(e) => onChange({ ...preview, content: e.target.value })}
            spellCheck={false}
            className="min-h-0 w-full resize-none overflow-auto bg-gray-950 text-gray-100 rounded-lg p-4 text-xs leading-5 font-mono outline-none border border-gray-900 focus:border-blue-500 whitespace-pre"
          />
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-3 mt-4">
          <div className="text-xs text-gray-400">
            可直接编辑配置；保存后可放入 nginx 的 conf.d 目录。
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onCopyConfig} variant="secondary">
              {copiedId === `nginx-${previewKey}` ? (
                <Check size={14} className="mr-2 text-green-500" />
              ) : (
                <Copy size={14} className="mr-2" />
              )}
              复制
            </Button>
            <Button onClick={onSaveConfig} variant="primary">
              <Download size={14} className="mr-2" />
              保存 .conf
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
