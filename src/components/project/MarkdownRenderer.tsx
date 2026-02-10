import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github.css';
import { convertFileSrc } from '@tauri-apps/api/core';

interface MarkdownRendererProps {
  content: string;
  basePath?: string; // 项目根路径，用于解析相对路径
}

export function MarkdownRenderer({ content, basePath }: MarkdownRendererProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // 解析图片路径
  function resolveImageSrc(src: string): string {
    if (!src) return src;

    // 已经是完整 URL（http/https/data）或已经是 asset 协议
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('asset://')) {
      return src;
    }

    // 有 basePath 时，解析相对路径为本地文件
    if (basePath) {
      // 标准化 basePath（处理 Windows 反斜杠）
      const normalizedBase = basePath.replace(/\\/g, '/');
      // 移除 src 开头的 ./ 或 /
      const cleanSrc = src.replace(/^\.?\//, '');
      // 组合完整路径
      const fullPath = `${normalizedBase}/${cleanSrc}`;

      // 使用 Tauri 的 convertFileSrc 转换为可访问的 URL
      try {
        return convertFileSrc(fullPath);
      } catch (e) {
        console.error('Failed to convert file src:', fullPath, e);
        return src;
      }
    }

    return src;
  }

  return (
    <div className="markdown-body prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          // Customize rendering for better styling
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b border-gray-200" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3 pb-2 border-b border-gray-200" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-base font-bold mt-3 mb-2" {...props} />,
          p: ({ node, ...props }) => <p className="my-3 leading-relaxed" {...props} />,
          ul: ({ node, ...props }) => <ul className="my-3 ml-6 list-disc" {...props} />,
          ol: ({ node, ...props }) => <ol className="my-3 ml-6 list-decimal" {...props} />,
          li: ({ node, ...props }) => <li className="my-1" {...props} />,
          code: (props: any) => {
            const { node, className, children, inline, ...rest } = props;
            // 判断是否是代码块：
            // 1. 有 className（通常是 language-xxx）
            // 2. 或者 inline 明确为 false
            // 3. 或者内容包含换行符
            const content = String(children || '');
            const hasLanguage = className && className.startsWith('language-');
            const hasNewline = content.includes('\n');
            const isCodeBlock = hasLanguage || hasNewline || inline === false;

            if (isCodeBlock) {
              return (
                <code className={`block p-3 bg-gray-50 rounded-lg overflow-x-auto text-sm font-mono ${className || ''}`} {...rest}>
                  {children}
                </code>
              );
            }

            // 内联代码
            return (
              <code className="px-1.5 py-0.5 bg-gray-100 rounded text-sm font-mono text-red-600" {...rest}>
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => <pre className="my-4 bg-gray-50 rounded-lg overflow-hidden" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="my-4 pl-4 border-l-4 border-gray-300 text-gray-600 italic" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => <td className="border border-gray-300 px-4 py-2" {...props} />,
          img: ({ node, src, alt, ...props }) => {
            const resolvedSrc = resolveImageSrc(src || '');
            const hasError = imageErrors.has(src || '');

            // 如果图片加载失败，显示占位符
            if (hasError) {
              return (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-gray-500 text-xs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {alt || '图片'}
                </span>
              );
            }

            return (
              <img
                src={resolvedSrc}
                alt={alt}
                className="max-w-full h-auto my-4 rounded-lg shadow-md"
                onError={() => {
                  setImageErrors(prev => new Set(prev).add(src || ''));
                }}
                {...props}
              />
            );
          },
          hr: ({ node, ...props }) => <hr className="my-6 border-t border-gray-300" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
