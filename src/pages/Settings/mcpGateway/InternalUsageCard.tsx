import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Wand2 } from "lucide-react";
import { mcpClient } from "@/services/mcp/client";

interface InternalUsageCardProps {
  running: boolean;
}

/**
 * 显示当前项目内"AI 功能"对 MCP gateway 的使用情况：
 * - 助手 Chat / ApiChat：会话开启时通过 mcpClient 调工具
 * - 简历：使用 chat_complete，不依赖工具
 * 这里只做静态枚举 + 当前可用工具数；准确"在线调用计数"留待后续做请求日志后再补。
 */
export function InternalUsageCard({ running }: InternalUsageCardProps) {
  const [toolCount, setToolCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) {
      setToolCount(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await mcpClient.refresh();
        const tools = await mcpClient.listTools();
        if (!cancelled) {
          setToolCount(tools.length);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setToolCount(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [running]);

  const features: Array<{ name: string; usesTools: boolean; note: string }> = [
    { name: "助手 Chat", usesTools: true, note: "会话工具菜单中可勾选启用，调用接口工具" },
    { name: "ApiChat 接口", usesTools: true, note: "自动通过 gateway 调已选端点" },
    { name: "简历生成", usesTools: false, note: "仅调用 chat_complete，不需要工具" },
  ];

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
      <div className="flex items-center gap-2">
        <Wand2 size={14} className="text-blue-500" />
        <span className="text-sm font-semibold text-gray-800">内部 AI 功能使用情况</span>
      </div>
      <div className="text-xs text-gray-500">
        {running ? (
          toolCount !== null ? (
            <>当前 gateway 共暴露 <span className="font-mono text-blue-600">{toolCount}</span> 个工具（即"接口"中已注册的端点）</>
          ) : error ? (
            <span className="text-amber-600">读取工具列表失败：{error}</span>
          ) : (
            "正在读取工具列表..."
          )
        ) : (
          "启动 gateway 后，下方 AI 功能可调用接口工具"
        )}
      </div>
      <ul className="space-y-1 text-xs">
        {features.map((f) => (
          <li key={f.name} className="flex items-start gap-2">
            {f.usesTools && running ? (
              <CheckCircle2 size={12} className="text-green-500 mt-0.5 flex-shrink-0" />
            ) : (
              <Circle size={12} className="text-gray-300 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="font-medium text-gray-700">{f.name}</div>
              <div className="text-[11px] text-gray-500 leading-tight">{f.note}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
