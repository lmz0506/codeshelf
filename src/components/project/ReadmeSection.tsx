import { useEffect, useState } from "react";
import { FileText, Loader2, ChevronRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ReadmeSectionProps {
  projectPath: string;
  onOpenFullView: (content: string) => void;
}

function extractPreview(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("---")) continue;
    if (line.startsWith("![")) continue;
    if (line.startsWith("<")) continue;
    return line.replace(/[`*_>[\]]/g, "").slice(0, 160);
  }
  return "";
}

export function ReadmeSection({ projectPath, onOpenFullView }: ReadmeSectionProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setNotFound(false);
    setLoading(true);
    invoke<string>("read_readme", { path: projectPath })
      .then((c) => {
        if (cancelled) return;
        setContent(c);
      })
      .catch(() => {
        if (cancelled) return;
        setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  if (notFound && !loading) return null;

  const preview = content ? extractPreview(content) : "";

  function handleClick() {
    if (!content) return;
    onOpenFullView(content);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!content}
      className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/40 transition-colors text-left disabled:opacity-60 disabled:cursor-default group"
      title={content ? "点击查看完整 README" : ""}
    >
      <FileText size={14} className="text-blue-600 flex-shrink-0" />
      <span className="text-sm font-medium text-gray-800 flex-shrink-0">项目说明</span>
      <span className="text-xs text-gray-400 flex-shrink-0">README.md</span>
      <span className="text-xs text-gray-500 truncate flex-1 min-w-0">
        {loading ? "加载中..." : preview}
      </span>
      {loading ? (
        <Loader2 size={12} className="text-gray-400 animate-spin flex-shrink-0" />
      ) : (
        <ChevronRight
          size={14}
          className="text-gray-400 group-hover:text-blue-500 flex-shrink-0 transition-colors"
        />
      )}
    </button>
  );
}
