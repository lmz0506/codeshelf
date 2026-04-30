import { AlertTriangle, ShieldAlert } from "lucide-react";
import { expiringSoon, isActiveKey, isExposedHost } from "./utils";
import type { McpGatewayKey, McpGatewayStatus } from "./types";

interface Props {
  status: McpGatewayStatus | null;
  host: string;
  keys: McpGatewayKey[];
}

/**
 * 把鉴权相关的告警集中在一处显示：
 * 1. 网关在跑但没有任何可用密钥 → 危险
 * 2. 监听到 0.0.0.0 / 局域网 IP → 警告
 * 3. 7 天内将过期的密钥 → 警告（提示及时轮换）
 */
export function SecurityNotice({ status, host, keys }: Props) {
  const running = !!status?.running;
  const activeHost = status?.host || host;
  const activeKeys = keys.filter(isActiveKey);
  const exposed = isExposedHost(activeHost);
  const noAuth = activeKeys.length === 0;
  const expiring = keys.filter((k) => expiringSoon(k, 7));

  type Notice = { tone: "danger" | "warn"; text: string };
  const notices: Notice[] = [];

  if (running && noAuth) {
    notices.push({
      tone: "danger",
      text: "网关已启动，但没有任何可用密钥，所有访问者都能直接调用 /mcp。请添加并启用至少一条密钥。",
    });
  }
  if (exposed && noAuth) {
    notices.push({
      tone: "danger",
      text: `当前监听地址 ${activeHost} 不限于本机，且没有可用密钥，端口处于完全开放状态。建议立即添加密钥，或改回 127.0.0.1。`,
    });
  } else if (exposed) {
    notices.push({
      tone: "warn",
      text: `监听地址 ${activeHost} 不是本机，端口可被局域网/外部访问，请确认密钥分发可控。`,
    });
  }
  if (expiring.length > 0) {
    notices.push({
      tone: "warn",
      text: `${expiring.length} 个密钥将在 7 天内过期：${expiring.map((k) => k.name).join("、")}。请及时轮换以避免客户端断连。`,
    });
  }

  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((msg, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 text-xs rounded-lg border p-3 ${
            msg.tone === "danger"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {msg.tone === "danger"
            ? <ShieldAlert size={14} className="shrink-0 mt-px" />
            : <AlertTriangle size={14} className="shrink-0 mt-px" />}
          <span className="leading-relaxed">{msg.text}</span>
        </div>
      ))}
    </div>
  );
}
