// Netcat 协议测试工具

import { useState, useEffect, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  netcatCreateSession,
  netcatStartSession,
  netcatStopSession,
  netcatRemoveSession,
  netcatSendMessage,
  netcatGetSessions,
  netcatGetMessages,
  netcatGetClients,
  netcatClearMessages,
  netcatDisconnectClient,
  formatBytes,
} from "@/services/toolbox";
import type {
  Protocol,
  SessionMode,
  DataFormat,
  NetcatSession,
  NetcatMessage,
  ConnectedClient,
  NetcatEvent,
} from "@/types/toolbox";
import { Button, Input } from "@/components/ui";

// 状态颜色映射
const statusColors: Record<string, string> = {
  connecting: "text-yellow-500",
  connected: "text-green-500",
  listening: "text-blue-500",
  disconnected: "text-gray-500",
  error: "text-red-500",
};

// 状态文本映射
const statusText: Record<string, string> = {
  connecting: "连接中",
  connected: "已连接",
  listening: "监听中",
  disconnected: "未连接",
  error: "错误",
};

export default function NetcatTool() {
  // 会话列表
  const [sessions, setSessions] = useState<NetcatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NetcatMessage[]>([]);
  const [clients, setClients] = useState<ConnectedClient[]>([]);

  // 新建会话表单
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProtocol, setNewProtocol] = useState<Protocol>("tcp");
  const [newMode, setNewMode] = useState<SessionMode>("client");
  const [newHost, setNewHost] = useState("127.0.0.1");
  const [newPort, setNewPort] = useState("8080");
  const [newName, setNewName] = useState("");

  // 发送消息
  const [sendData, setSendData] = useState("");
  const [sendFormat, setSendFormat] = useState<DataFormat>("text");
  const [targetClient, setTargetClient] = useState<string>("");
  const [broadcast, setBroadcast] = useState(false);

  // 自动滚动
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 获取当前选中的会话
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    try {
      const list = await netcatGetSessions();
      setSessions(list);
    } catch (err) {
      console.error("加载会话列表失败:", err);
    }
  }, []);

  // 加载消息
  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const msgs = await netcatGetMessages(sessionId, 200);
      setMessages(msgs.reverse());
    } catch (err) {
      console.error("加载消息失败:", err);
    }
  }, []);

  // 加载客户端
  const loadClients = useCallback(async (sessionId: string) => {
    try {
      const list = await netcatGetClients(sessionId);
      setClients(list);
    } catch (err) {
      console.error("加载客户端失败:", err);
    }
  }, []);

  // 初始化
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 选中会话时加载数据
  useEffect(() => {
    if (selectedSessionId) {
      loadMessages(selectedSessionId);
      if (selectedSession?.mode === "server") {
        loadClients(selectedSessionId);
      }
    } else {
      setMessages([]);
      setClients([]);
    }
  }, [selectedSessionId, selectedSession?.mode, loadMessages, loadClients]);

  // 监听事件
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<NetcatEvent>("netcat-event", (event) => {
        const data = event.payload;

        switch (data.type) {
          case "statusChanged":
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.sessionId
                  ? { ...s, status: data.status, errorMessage: data.error }
                  : s
              )
            );
            break;

          case "messageReceived":
            if (data.sessionId === selectedSessionId) {
              setMessages((prev) => [...prev, data.message]);
            }
            // 更新会话统计
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.sessionId
                  ? {
                      ...s,
                      bytesReceived: s.bytesReceived + data.message.size,
                      messageCount: s.messageCount + 1,
                    }
                  : s
              )
            );
            break;

          case "clientConnected":
            if (data.sessionId === selectedSessionId) {
              setClients((prev) => [...prev, data.client]);
            }
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.sessionId ? { ...s, clientCount: s.clientCount + 1 } : s
              )
            );
            break;

          case "clientDisconnected":
            if (data.sessionId === selectedSessionId) {
              setClients((prev) => prev.filter((c) => c.id !== data.clientId));
            }
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.sessionId ? { ...s, clientCount: Math.max(0, s.clientCount - 1) } : s
              )
            );
            break;
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [selectedSessionId]);

  // 自动滚动
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  // 创建会话
  const handleCreateSession = async () => {
    try {
      const session = await netcatCreateSession({
        protocol: newProtocol,
        mode: newMode,
        host: newHost,
        port: parseInt(newPort, 10),
        name: newName || undefined,
      });
      setSessions((prev) => [...prev, session]);
      setSelectedSessionId(session.id);
      setShowCreateForm(false);
      // 重置表单
      setNewName("");
    } catch (err) {
      console.error("创建会话失败:", err);
      alert(`创建会话失败: ${err}`);
    }
  };

  // 启动会话
  const handleStartSession = async (sessionId: string) => {
    try {
      await netcatStartSession(sessionId);
    } catch (err) {
      console.error("启动会话失败:", err);
      alert(`启动会话失败: ${err}`);
    }
  };

  // 停止会话
  const handleStopSession = async (sessionId: string) => {
    try {
      await netcatStopSession(sessionId);
    } catch (err) {
      console.error("停止会话失败:", err);
    }
  };

  // 删除会话
  const handleRemoveSession = async (sessionId: string) => {
    try {
      await netcatRemoveSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
    } catch (err) {
      console.error("删除会话失败:", err);
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!selectedSessionId || !sendData.trim()) return;

    try {
      const msg = await netcatSendMessage({
        sessionId: selectedSessionId,
        data: sendData,
        format: sendFormat,
        targetClient: targetClient || undefined,
        broadcast: broadcast || undefined,
      });
      setMessages((prev) => [...prev, msg]);
      setSendData("");
    } catch (err) {
      console.error("发送消息失败:", err);
      alert(`发送消息失败: ${err}`);
    }
  };

  // 清空消息
  const handleClearMessages = async () => {
    if (!selectedSessionId) return;
    try {
      await netcatClearMessages(selectedSessionId);
      setMessages([]);
    } catch (err) {
      console.error("清空消息失败:", err);
    }
  };

  // 断开客户端
  const handleDisconnectClient = async (clientId: string) => {
    if (!selectedSessionId) return;
    try {
      await netcatDisconnectClient(selectedSessionId, clientId);
    } catch (err) {
      console.error("断开客户端失败:", err);
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="h-full flex">
      {/* 左侧会话列表 */}
      <div className="w-64 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="font-medium">会话列表</h3>
          <Button size="sm" onClick={() => setShowCreateForm(true)}>
            + 新建
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`p-3 border-b border-gray-700 cursor-pointer hover:bg-gray-700/50 ${
                selectedSessionId === session.id ? "bg-gray-700" : ""
              }`}
              onClick={() => setSelectedSessionId(session.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm truncate">{session.name}</span>
                <span className={`text-xs ${statusColors[session.status]}`}>
                  {statusText[session.status]}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                {session.protocol.toUpperCase()} {session.mode === "server" ? "Server" : "Client"}
              </div>
              <div className="text-xs text-gray-500">
                {session.host}:{session.port}
              </div>
              {session.mode === "server" && session.clientCount > 0 && (
                <div className="text-xs text-blue-400 mt-1">
                  {session.clientCount} 个客户端
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col">
        {showCreateForm ? (
          /* 创建会话表单 */
          <div className="p-4">
            <h3 className="text-lg font-medium mb-4">新建会话</h3>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm text-gray-400 mb-1">会话名称（可选）</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="自动生成"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">协议</label>
                  <select
                    className="w-full bg-gray-700 rounded px-3 py-2"
                    value={newProtocol}
                    onChange={(e) => setNewProtocol(e.target.value as Protocol)}
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">模式</label>
                  <select
                    className="w-full bg-gray-700 rounded px-3 py-2"
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as SessionMode)}
                  >
                    <option value="client">客户端</option>
                    <option value="server">服务器</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">
                    {newMode === "server" ? "绑定地址" : "目标地址"}
                  </label>
                  <Input
                    value={newHost}
                    onChange={(e) => setNewHost(e.target.value)}
                    placeholder="127.0.0.1"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm text-gray-400 mb-1">端口</label>
                  <Input
                    type="number"
                    value={newPort}
                    onChange={(e) => setNewPort(e.target.value)}
                    placeholder="8080"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleCreateSession}>创建</Button>
                <Button variant="secondary" onClick={() => setShowCreateForm(false)}>
                  取消
                </Button>
              </div>
            </div>
          </div>
        ) : selectedSession ? (
          /* 会话详情 */
          <>
            {/* 工具栏 */}
            <div className="p-3 border-b border-gray-700 flex items-center gap-2">
              <div className="flex-1">
                <span className="font-medium">{selectedSession.name}</span>
                <span className={`ml-2 text-sm ${statusColors[selectedSession.status]}`}>
                  {statusText[selectedSession.status]}
                </span>
                {selectedSession.errorMessage && (
                  <span className="ml-2 text-sm text-red-400">
                    ({selectedSession.errorMessage})
                  </span>
                )}
              </div>

              {selectedSession.status === "disconnected" ||
              selectedSession.status === "error" ? (
                <Button size="sm" onClick={() => handleStartSession(selectedSession.id)}>
                  {selectedSession.mode === "server" ? "启动" : "连接"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleStopSession(selectedSession.id)}
                >
                  停止
                </Button>
              )}

              <Button size="sm" variant="secondary" onClick={handleClearMessages}>
                清空
              </Button>

              <Button
                size="sm"
                variant="danger"
                onClick={() => handleRemoveSession(selectedSession.id)}
              >
                删除
              </Button>
            </div>

            {/* 统计信息 */}
            <div className="px-3 py-2 border-b border-gray-700 text-sm text-gray-400 flex gap-4">
              <span>发送: {formatBytes(selectedSession.bytesSent)}</span>
              <span>接收: {formatBytes(selectedSession.bytesReceived)}</span>
              <span>消息: {selectedSession.messageCount}</span>
              <label className="flex items-center gap-1 ml-auto">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                自动滚动
              </label>
            </div>

            {/* 服务器模式显示客户端列表 */}
            {selectedSession.mode === "server" && clients.length > 0 && (
              <div className="px-3 py-2 border-b border-gray-700">
                <div className="text-sm text-gray-400 mb-1">
                  已连接客户端 ({clients.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {clients.map((client) => (
                    <div
                      key={client.id}
                      className="bg-gray-700 rounded px-2 py-1 text-sm flex items-center gap-2"
                    >
                      <span>{client.addr}</span>
                      <button
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDisconnectClient(client.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-3 font-mono text-sm">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`mb-2 ${
                    msg.direction === "sent" ? "text-green-400" : "text-blue-400"
                  }`}
                >
                  <span className="text-gray-500">[{formatTime(msg.timestamp)}]</span>
                  <span className="mx-1">
                    {msg.direction === "sent" ? "→" : "←"}
                  </span>
                  {msg.clientAddr && (
                    <span className="text-gray-400">[{msg.clientAddr}] </span>
                  )}
                  <span className="whitespace-pre-wrap break-all">{msg.data}</span>
                  <span className="text-gray-500 ml-2">({msg.size}B)</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* 发送区域 */}
            <div className="p-3 border-t border-gray-700">
              {selectedSession.mode === "server" && clients.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <select
                    className="bg-gray-700 rounded px-2 py-1 text-sm"
                    value={targetClient}
                    onChange={(e) => setTargetClient(e.target.value)}
                    disabled={broadcast}
                  >
                    <option value="">选择客户端...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.addr}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={broadcast}
                      onChange={(e) => setBroadcast(e.target.checked)}
                    />
                    广播
                  </label>
                </div>
              )}

              <div className="flex gap-2">
                <select
                  className="bg-gray-700 rounded px-2 py-1"
                  value={sendFormat}
                  onChange={(e) => setSendFormat(e.target.value as DataFormat)}
                >
                  <option value="text">文本</option>
                  <option value="hex">HEX</option>
                  <option value="base64">Base64</option>
                </select>
                <Input
                  className="flex-1"
                  value={sendData}
                  onChange={(e) => setSendData(e.target.value)}
                  placeholder={
                    sendFormat === "hex"
                      ? "48 65 6C 6C 6F 或 48656C6C6F"
                      : sendFormat === "base64"
                      ? "Base64 编码内容"
                      : "输入要发送的内容..."
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={
                    !sendData.trim() ||
                    (selectedSession.status !== "connected" &&
                      selectedSession.status !== "listening")
                  }
                >
                  发送
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* 空状态 */
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="mb-2">选择或创建一个会话开始测试</p>
              <Button onClick={() => setShowCreateForm(true)}>+ 新建会话</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
