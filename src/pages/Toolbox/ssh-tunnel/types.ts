import type { SshTunnel, TestPortResult } from "@/types/toolbox";

export type AuthType = "key" | "password" | "sshConfig";

export interface DeleteConfirmState {
  id: string;
  name: string;
}

export interface TestState {
  tunnelId: string;
  loading: boolean;
  result?: TestPortResult;
}

export interface TunnelListCallbacks {
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onEdit: (tunnel: SshTunnel) => void;
  onRemove: (tunnel: SshTunnel) => void;
  onCopyLocal: (tunnel: SshTunnel) => void;
  onTest: (tunnel: SshTunnel) => void;
}
