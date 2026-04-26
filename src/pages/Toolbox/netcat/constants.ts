// Netcat 常量配置

import { Wifi, WifiOff, Radio, Server } from "lucide-react";
import type { AutoSendConfig } from "@/types/toolbox";

// 状态配置
export const statusConfig: Record<string, { color: string; bg: string; icon: typeof Wifi }> = {
  connecting: { color: "text-yellow-500", bg: "bg-yellow-500/10", icon: Radio },
  connected: { color: "text-green-500", bg: "bg-green-500/10", icon: Wifi },
  listening: { color: "text-blue-500", bg: "bg-blue-500/10", icon: Server },
  disconnected: { color: "text-gray-400", bg: "bg-gray-500/10", icon: WifiOff },
  error: { color: "text-red-500", bg: "bg-red-500/10", icon: WifiOff },
};

export const statusText: Record<string, string> = {
  connecting: "连接中",
  connected: "已连接",
  listening: "监听中",
  disconnected: "未连接",
  error: "错误",
};

// 默认自动发送配置
export const defaultAutoSendConfig: AutoSendConfig = {
  enabled: false,
  intervalMs: 1000,
  mode: "fixed",
  fixedData: "",
  csvData: "",
  template: "",
  httpUrl: "",
  httpMethod: "GET",
  httpHeaders: "",
  httpBody: "",
  httpJsonPath: "",
};
