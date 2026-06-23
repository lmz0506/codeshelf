/**
 * MCP Gateway 设置相关的前端类型。
 * 字段命名与后端 storage::schema::McpGatewayKey / AppSettings 保持一致。
 */

export interface McpGatewayStatus {
  running: boolean;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  startedAt?: string | null;
}

export interface McpGatewayKey {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

/** 与后端 save_app_settings 命令对齐的部分字段。 */
export interface AppSettings {
  mcp_gateway_enabled?: boolean;
  mcp_gateway_host?: string;
  mcp_gateway_port?: number;
  mcp_gateway_keys?: McpGatewayKey[];
}

/** 过期方式：永久 / 预设天数 / 自定义日期。 */
export type ExpiryMode =
  | "never"
  | "preset_1d"
  | "preset_7d"
  | "preset_30d"
  | "preset_90d"
  | "at";

export interface ExpiryConfig {
  mode: ExpiryMode;
  /** 仅当 mode === "at" 时有效，格式同 input[type=datetime-local]。 */
  customLocal: string;
}
