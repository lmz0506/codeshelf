import type { ForwardRule, ServerConfig } from "@/types/toolbox";

export type ServiceType = "web" | "forward";
export type TabType = "all" | "web" | "forward";

export interface DeleteConfirmState {
  type: "server" | "forward";
  id: string;
  name: string;
}

export interface NginxPreviewState {
  server?: ServerConfig;
  title?: string;
  subtitle?: string;
  fileName?: string;
  content: string;
}

export interface ServiceListCallbacks {
  getServerUrl: (server: ServerConfig) => string;
  getForwardUrl: (rule: ForwardRule) => string;
  onOpenServer: (server: ServerConfig) => void;
  onOpenForward: (rule: ForwardRule) => void;
  onCopyServerUrl: (server: ServerConfig) => void;
  onCopyForwardUrl: (rule: ForwardRule) => void;
  onGenerateNginx: (server: ServerConfig) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onEditServer: (server: ServerConfig) => void;
  onRemoveServer: (server: ServerConfig) => void;
  onStartForward: (ruleId: string) => void;
  onStopForward: (ruleId: string) => void;
  onEditForward: (rule: ForwardRule) => void;
  onRemoveForward: (rule: ForwardRule) => void;
}
