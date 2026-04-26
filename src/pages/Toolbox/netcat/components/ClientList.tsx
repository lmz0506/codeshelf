// 已连接客户端列表组件

import { Users, Monitor, X } from "lucide-react";
import type { ConnectedClient } from "@/types/toolbox";

interface ClientListProps {
  clients: ConnectedClient[];
  onDisconnectClient: (clientId: string) => void;
}

export default function ClientList({ clients, onDisconnectClient }: ClientListProps) {
  if (clients.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
      <div className="flex items-center gap-2 text-sm">
        <Users size={14} className="text-blue-500" />
        <span className="text-blue-700 dark:text-blue-300 font-medium">
          已连接客户端 ({clients.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-gray-800 rounded-lg text-sm border border-blue-200 dark:border-blue-800"
          >
            <Monitor size={12} className="text-blue-500" />
            <span className="text-gray-700 dark:text-gray-300">{client.addr}</span>
            <span className="text-gray-400 dark:text-gray-500 text-xs">
              {new Date(client.connectedAt).toLocaleTimeString()}
            </span>
            <button
              onClick={() => onDisconnectClient(client.id)}
              className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
