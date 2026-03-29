import { X, FileDown, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { GeneratedResume } from "@/types/resume";
import { exportResumeToMarkdown } from "@/services/resume/export";

interface ResumePreviewProps {
  resume: GeneratedResume;
  onClose: () => void;
  onExport: () => void;
}

export function ResumePreview({ resume, onClose, onExport }: ResumePreviewProps) {
  const [copied, setCopied] = useState(false);
  const markdown = exportResumeToMarkdown(resume);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">简历预览</h3>
            <p className="text-sm text-gray-500">
              生成于 {new Date(resume.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-green-600" />
                  已复制
                </>
              ) : (
                <>
                  <Copy size={14} />
                  复制
                </>
              )}
            </button>
            <button
              onClick={onExport}
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1"
            >
              <FileDown size={14} />
              导出文件
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="prose prose-sm max-w-none">
            <MarkdownPreview content={markdown} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  // 简单的 Markdown 渲染
  const lines = content.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        // 标题
        if (line.startsWith("# ")) {
          return (
            <h1 key={index} className="text-2xl font-bold text-gray-900 pb-2 border-b">
              {line.replace("# ", "")}
            </h1>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={index} className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              {line.replace("## ", "")}
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <h3 key={index} className="text-lg font-medium text-gray-800 mt-4 mb-2">
              {line.replace("### ", "")}
            </h3>
          );
        }

        // 引用
        if (line.startsWith("> ")) {
          return (
            <blockquote key={index} className="text-sm text-gray-500 italic border-l-2 border-gray-300 pl-3">
              {line.replace("> ", "")}
            </blockquote>
          );
        }

        // 分割线
        if (line === "---") {
          return <hr key={index} className="my-4 border-gray-200" />;
        }

        // 粗体
        if (line.includes("**")) {
          const parts = line.split(/(\*\*.*?\*\*)/);
          return (
            <p key={index} className="text-sm text-gray-700 leading-relaxed">
              {parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return <strong key={i} className="font-medium text-gray-900">{part.slice(2, -2)}</strong>;
                }
                return part;
              })}
            </p>
          );
        }

        // 空行
        if (line.trim() === "") {
          return <div key={index} className="h-2" />;
        }

        // 普通段落
        return (
          <p key={index} className="text-sm text-gray-700 leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}
