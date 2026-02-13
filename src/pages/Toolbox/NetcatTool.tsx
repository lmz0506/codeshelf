// Netcat 协议测试工具

import { useState, useEffect, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  Plus,
  Play,
  Square,
  Trash2,
  Send,
  Eraser,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Wifi,
  WifiOff,
  Radio,
  Server,
  Monitor,
  X,
  ChevronUp,
  Loader2,
  Timer,
  Pause,
} from "lucide-react";
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

// 状态配置
const statusConfig: Record<string, { color: string; bg: string; icon: typeof Wifi }> = {
  connecting: { color: "text-yellow-500", bg: "bg-yellow-500/10", icon: Radio },
  connected: { color: "text-green-500", bg: "bg-green-500/10", icon: Wifi },
  listening: { color: "text-blue-500", bg: "bg-blue-500/10", icon: Server },
  disconnected: { color: "text-gray-400", bg: "bg-gray-500/10", icon: WifiOff },
  error: { color: "text-red-500", bg: "bg-red-500/10", icon: WifiOff },
};

const statusText: Record<string, string> = {
  connecting: "连接中",
  connected: "已连接",
  listening: "监听中",
  disconnected: "未连接",
  error: "错误",
};

export default function NetcatTool() {
  const [sessions, setSessions] = useState<NetcatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NetcatMessage[]>([]);
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [loading, setLoading] = useState<string | null>(null); // 'start' | 'stop' | 'create' | 'delete'

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
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // 自动发送
  const [showAutoSendPanel, setShowAutoSendPanel] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [autoSendInterval, setAutoSendInterval] = useState(1000); // 毫秒
  const [autoSendMode, setAutoSendMode] = useState<"fixed" | "csv" | "template" | "http">("fixed");
  const [autoSendFixedData, setAutoSendFixedData] = useState(""); // 固定内容
  const [autoSendCsvData, setAutoSendCsvData] = useState("");
  const [autoSendCsvIndex, setAutoSendCsvIndex] = useState(0);
  const [autoSendTemplate, setAutoSendTemplate] = useState(""); // 支持 {{random:1-100}} {{uuid}} {{timestamp}} 等
  const [autoSendHttpUrl, setAutoSendHttpUrl] = useState("");
  const [autoSendCount, setAutoSendCount] = useState(0); // 已发送次数
  const autoSendTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 自动滚动
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const loadSessions = useCallback(async () => {
    try {
      const list = await netcatGetSessions();
      setSessions(list);
    } catch (err) {
      console.error("加载会话列表失败:", err);
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const msgs = await netcatGetMessages(sessionId, 200);
      setMessages(msgs.reverse());
    } catch (err) {
      console.error("加载消息失败:", err);
    }
  }, []);

  const loadClients = useCallback(async (sessionId: string) => {
    try {
      const list = await netcatGetClients(sessionId);
      setClients(list);
    } catch (err) {
      console.error("加载客户端失败:", err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

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
    return () => { unlisten?.(); };
  }, [selectedSessionId]);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  const handleCreateSession = async () => {
    setLoading("create");
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
      setNewName("");
    } catch (err) {
      console.error("创建会话失败:", err);
      alert(`创建会话失败: ${err}`);
    } finally {
      setLoading(null);
    }
  };

  const handleStartSession = async (sessionId: string) => {
    setLoading("start");
    // 立即更新本地状态为"连接中"
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, status: "connecting" as const } : s
      )
    );
    try {
      await netcatStartSession(sessionId);
      // 启动是异步的，状态会通过事件更新
    } catch (err) {
      console.error("启动会话失败:", err);
      // 恢复状态
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: "error" as const, errorMessage: String(err) } : s
        )
      );
      alert(`启动会话失败: ${err}`);
    } finally {
      setLoading(null);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    setLoading("stop");
    try {
      await netcatStopSession(sessionId);
      // 立即更新本地状态
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: "disconnected" as const } : s
        )
      );
    } catch (err) {
      console.error("停止会话失败:", err);
      alert(`停止会话失败: ${err}`);
    } finally {
      setLoading(null);
    }
  };

  const handleRemoveSession = async (sessionId: string) => {
    setLoading("delete");
    try {
      await netcatRemoveSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
    } catch (err) {
      console.error("删除会话失败:", err);
      alert(`删除会话失败: ${err}`);
    } finally {
      setLoading(null);
    }
  };

  const handleSendMessage = async (dataOverride?: string) => {
    const dataToSend = dataOverride ?? sendData;
    if (!selectedSessionId || !dataToSend.trim()) return;

    try {
      const msg = await netcatSendMessage({
        sessionId: selectedSessionId,
        data: dataToSend,
        format: sendFormat,
        targetClient: targetClient || undefined,
        broadcast: broadcast || undefined,
      });
      setMessages((prev) => [...prev, msg]);
      if (!dataOverride) {
        setSendData("");
      }
      return true;
    } catch (err) {
      console.error("发送消息失败:", err);
      if (!dataOverride) {
        alert(`发送消息失败: ${err}`);
      }
      return false;
    }
  };

  const handleClearMessages = async () => {
    if (!selectedSessionId) return;
    try {
      await netcatClearMessages(selectedSessionId);
      setMessages([]);
    } catch (err) {
      console.error("清空消息失败:", err);
    }
  };

  // 生成模板数据
  const generateTemplateData = (template: string): string => {
    return template.replace(/\{\{(\w+)(?::([^}]+))?\}\}/g, (_, type, param) => {
      switch (type) {
        case "random": {
          const [min, max] = (param || "1-100").split("-").map(Number);
          return String(Math.floor(Math.random() * (max - min + 1)) + min);
        }
        case "uuid":
          return crypto.randomUUID();
        case "timestamp":
          return String(Date.now());
        case "datetime":
          return new Date().toISOString();
        case "date":
          return new Date().toISOString().split("T")[0];
        case "time":
          return new Date().toLocaleTimeString();
        case "float": {
          const [fmin, fmax] = (param || "0-1").split("-").map(Number);
          return (Math.random() * (fmax - fmin) + fmin).toFixed(2);
        }
        case "choice": {
          const choices = (param || "a,b,c").split(",");
          return choices[Math.floor(Math.random() * choices.length)];
        }
        default:
          return `{{${type}}}`;
      }
    });
  };

  // 获取下一条自动发送数据
  const getNextAutoSendData = async (): Promise<string | null> => {
    switch (autoSendMode) {
      case "fixed":
        return autoSendFixedData || null;
      case "csv": {
        const lines = autoSendCsvData.split("\n").filter((l) => l.trim());
        if (lines.length === 0) return null;
        const data = lines[autoSendCsvIndex % lines.length];
        setAutoSendCsvIndex((prev) => prev + 1);
        return data;
      }
      case "template":
        return generateTemplateData(autoSendTemplate);
      case "http": {
        if (!autoSendHttpUrl) return null;
        try {
          const response = await fetch(autoSendHttpUrl);
          return await response.text();
        } catch (err) {
          console.error("HTTP 获取失败:", err);
          return null;
        }
      }
      default:
        return null;
    }
  };

  // 自动发送逻辑
  useEffect(() => {
    if (autoSendEnabled && selectedSession &&
        (selectedSession.status === "connected" || selectedSession.status === "listening")) {
      const doAutoSend = async () => {
        const data = await getNextAutoSendData();
        if (data) {
          const success = await handleSendMessage(data);
          if (success) {
            setAutoSendCount((prev) => prev + 1);
          }
        }
      };

      autoSendTimerRef.current = setInterval(doAutoSend, autoSendInterval);
      return () => {
        if (autoSendTimerRef.current) {
          clearInterval(autoSendTimerRef.current);
        }
      };
    } else {
      if (autoSendTimerRef.current) {
        clearInterval(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
    }
  }, [autoSendEnabled, autoSendInterval, autoSendMode, selectedSession?.status, selectedSessionId]);

  // 停止自动发送当会话改变
  useEffect(() => {
    setAutoSendEnabled(false);
    setAutoSendCount(0);
    setAutoSendCsvIndex(0);
  }, [selectedSessionId]);

  const handleDisconnectClient = async (clientId: string) => {
    if (!selectedSessionId) return;
    try {
      await netcatDisconnectClient(selectedSessionId, clientId);
    } catch (err) {
      console.error("断开客户端失败:", err);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900">
      {/* 左侧会话列表 */}
      <div className="w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">会话列表</h3>
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} />
              新建
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sessions.length} 个会话
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Radio size={32} className="mb-2 opacity-50" />
              <p className="text-sm">暂无会话</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => {
                const config = statusConfig[session.status] || statusConfig.disconnected;
                const StatusIcon = config.icon;
                return (
                  <div
                    key={session.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedSessionId === session.id
                        ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
                        : "bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <StatusIcon size={16} className={config.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                            {session.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                            {statusText[session.status]}
                          </span>
                          <span>{session.protocol.toUpperCase()}</span>
                          <span>{session.mode === "server" ? "服务器" : "客户端"}</span>
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {session.host}:{session.port}
                        </div>
                        {session.mode === "server" && session.clientCount > 0 && (
                          <div className="flex items-center gap-1 text-xs text-blue-500 mt-1">
                            <Users size={12} />
                            {session.clientCount} 个客户端
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col">
        {showCreateForm ? (
          /* 创建会话表单 */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">新建会话</h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    会话名称
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="可选，留空自动生成"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      协议
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      value={newProtocol}
                      onChange={(e) => setNewProtocol(e.target.value as Protocol)}
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      模式
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      value={newMode}
                      onChange={(e) => setNewMode(e.target.value as SessionMode)}
                    >
                      <option value="client">客户端</option>
                      <option value="server">服务器</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {newMode === "server" ? "绑定地址" : "目标地址"}
                    </label>
                    <input
                      type="text"
                      value={newHost}
                      onChange={(e) => setNewHost(e.target.value)}
                      placeholder="127.0.0.1"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      端口
                    </label>
                    <input
                      type="number"
                      value={newPort}
                      onChange={(e) => setNewPort(e.target.value)}
                      placeholder="8080"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleCreateSession}
                    className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
                  >
                    创建会话
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : selectedSession ? (
          /* 会话详情 */
          <>
            {/* 工具栏 */}
            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${statusConfig[selectedSession.status]?.bg}`}>
                    {(() => {
                      const Icon = statusConfig[selectedSession.status]?.icon || WifiOff;
                      return <Icon size={18} className={statusConfig[selectedSession.status]?.color} />;
                    })()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {selectedSession.name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[selectedSession.status]?.bg} ${statusConfig[selectedSession.status]?.color}`}>
                        {statusText[selectedSession.status]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {selectedSession.protocol.toUpperCase()} · {selectedSession.host}:{selectedSession.port}
                      {selectedSession.errorMessage && (
                        <span className="text-red-500 ml-2">· {selectedSession.errorMessage}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedSession.status === "disconnected" || selectedSession.status === "error" ? (
                    <button
                      onClick={() => handleStartSession(selectedSession.id)}
                      disabled={loading === "start"}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {loading === "start" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                      {selectedSession.mode === "server" ? "启动" : "连接"}
                    </button>
                  ) : selectedSession.status === "connecting" ? (
                    <button
                      disabled
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded-lg"
                    >
                      <Loader2 size={14} className="animate-spin" />
                      连接中...
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStopSession(selectedSession.id)}
                      disabled={loading === "stop"}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {loading === "stop" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Square size={14} />
                      )}
                      停止
                    </button>
                  )}

                  <button
                    onClick={handleClearMessages}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Eraser size={14} />
                    清空
                  </button>

                  <button
                    onClick={() => handleRemoveSession(selectedSession.id)}
                    disabled={loading === "delete"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors"
                  >
                    {loading === "delete" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    删除
                  </button>
                </div>
              </div>
            </div>

            {/* 统计栏 */}
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex items-center gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <ArrowUpRight size={14} className="text-green-500" />
                发送: <span className="font-medium text-gray-900 dark:text-white">{formatBytes(selectedSession.bytesSent)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <ArrowDownLeft size={14} className="text-blue-500" />
                接收: <span className="font-medium text-gray-900 dark:text-white">{formatBytes(selectedSession.bytesReceived)}</span>
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                消息: <span className="font-medium text-gray-900 dark:text-white">{selectedSession.messageCount}</span>
              </div>
              <label className="flex items-center gap-1.5 ml-auto text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                自动滚动
              </label>
            </div>

            {/* 服务器模式客户端列表 */}
            {selectedSession.mode === "server" && clients.length > 0 && (
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
                      <button
                        onClick={() => handleDisconnectClient(client.id)}
                        className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-900 font-mono text-sm">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Radio size={32} className="mb-2 opacity-50" />
                  <p>暂无消息</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`mb-1 flex items-start gap-2 ${
                      msg.direction === "sent" ? "text-green-400" : "text-cyan-400"
                    }`}
                  >
                    <span className="text-gray-500 shrink-0">[{formatTime(msg.timestamp)}]</span>
                    <span className="shrink-0">
                      {msg.direction === "sent" ? (
                        <ArrowUpRight size={14} className="text-green-500" />
                      ) : (
                        <ArrowDownLeft size={14} className="text-cyan-500" />
                      )}
                    </span>
                    {msg.clientAddr && (
                      <span className="text-gray-400 shrink-0">[{msg.clientAddr}]</span>
                    )}
                    <span className="whitespace-pre-wrap break-all">{msg.data}</span>
                    <span className="text-gray-600 shrink-0">({msg.size}B)</span>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 发送区域 */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              {/* 自动发送配置面板 */}
              {showAutoSendPanel && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <Timer size={16} />
                      自动发送配置
                    </h4>
                    <button
                      onClick={() => setShowAutoSendPanel(false)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      <X size={16} className="text-gray-500" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">发送模式</label>
                      <select
                        className="w-full px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
                        value={autoSendMode}
                        onChange={(e) => setAutoSendMode(e.target.value as typeof autoSendMode)}
                      >
                        <option value="fixed">固定内容</option>
                        <option value="csv">CSV/多行</option>
                        <option value="template">模板生成</option>
                        <option value="http">HTTP 获取</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">发送间隔 (ms)</label>
                      <input
                        type="number"
                        className="w-full px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
                        value={autoSendInterval}
                        onChange={(e) => setAutoSendInterval(Math.max(100, parseInt(e.target.value) || 1000))}
                        min={100}
                        step={100}
                      />
                    </div>
                  </div>

                  {autoSendMode === "csv" && (
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        CSV 数据 (每行一条，循环发送)
                      </label>
                      <textarea
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono h-24 resize-none"
                        value={autoSendCsvData}
                        onChange={(e) => setAutoSendCsvData(e.target.value)}
                        placeholder="第一行数据&#10;第二行数据&#10;第三行数据"
                      />
                    </div>
                  )}

                  {autoSendMode === "template" && (
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        模板 (支持: {`{{random:1-100}}`} {`{{uuid}}`} {`{{timestamp}}`} {`{{float:0-100}}`} {`{{choice:a,b,c}}`})
                      </label>
                      <textarea
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono h-24 resize-none"
                        value={autoSendTemplate}
                        onChange={(e) => setAutoSendTemplate(e.target.value)}
                        placeholder='{"id":"{{uuid}}","value":{{random:1-100}},"time":{{timestamp}}}'
                      />
                    </div>
                  )}

                  {autoSendMode === "http" && (
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        HTTP 接口 URL (每次发送前请求获取内容)
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm"
                        value={autoSendHttpUrl}
                        onChange={(e) => setAutoSendHttpUrl(e.target.value)}
                        placeholder="http://localhost:8080/api/mock-data"
                      />
                    </div>
                  )}

                  {autoSendMode === "fixed" && (
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        固定发送内容
                      </label>
                      <textarea
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono h-20 resize-none"
                        value={autoSendFixedData}
                        onChange={(e) => setAutoSendFixedData(e.target.value)}
                        placeholder="输入要循环发送的固定内容..."
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      已发送: <span className="font-medium text-gray-700 dark:text-gray-300">{autoSendCount}</span> 条
                    </span>
                    <button
                      onClick={() => {
                        setAutoSendEnabled(!autoSendEnabled);
                        if (!autoSendEnabled) {
                          setAutoSendCount(0);
                          setAutoSendCsvIndex(0);
                        }
                      }}
                      disabled={selectedSession.status !== "connected" && selectedSession.status !== "listening"}
                      className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        autoSendEnabled
                          ? "bg-red-500 hover:bg-red-600 text-white"
                          : "bg-green-500 hover:bg-green-600 text-white"
                      } disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed`}
                    >
                      {autoSendEnabled ? (
                        <>
                          <Pause size={14} />
                          停止
                        </>
                      ) : (
                        <>
                          <Play size={14} />
                          开始自动发送
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {selectedSession.mode === "server" && clients.length > 0 && (
                <div className="flex items-center gap-3 mb-3">
                  {/* 自定义向上展开的客户端选择下拉框 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => !broadcast && setShowClientDropdown(!showClientDropdown)}
                      disabled={broadcast}
                      className={`flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm min-w-[160px] justify-between ${
                        broadcast ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      <span className="truncate">
                        {targetClient
                          ? clients.find((c) => c.id === targetClient)?.addr || "选择客户端..."
                          : "选择客户端..."}
                      </span>
                      <ChevronUp size={14} className={`shrink-0 transition-transform ${showClientDropdown ? "" : "rotate-180"}`} />
                    </button>
                    {showClientDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowClientDropdown(false)}
                        />
                        <div className="absolute bottom-full left-0 mb-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-20 overflow-hidden max-h-48 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetClient("");
                              setShowClientDropdown(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                              !targetClient ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""
                            }`}
                          >
                            选择客户端...
                          </button>
                          {clients.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setTargetClient(c.id);
                                setShowClientDropdown(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                                targetClient === c.id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""
                              }`}
                            >
                              {c.addr}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={broadcast}
                      onChange={(e) => setBroadcast(e.target.checked)}
                      className="rounded"
                    />
                    广播到所有客户端
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                {/* 自定义向上展开的下拉框 */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowFormatDropdown(!showFormatDropdown)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-w-[90px] justify-between"
                  >
                    <span>{sendFormat === "text" ? "文本" : sendFormat === "hex" ? "HEX" : "Base64"}</span>
                    <ChevronUp size={14} className={`transition-transform ${showFormatDropdown ? "" : "rotate-180"}`} />
                  </button>
                  {showFormatDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowFormatDropdown(false)}
                      />
                      <div className="absolute bottom-full left-0 mb-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-20 overflow-hidden">
                        {[
                          { value: "text" as DataFormat, label: "文本" },
                          { value: "hex" as DataFormat, label: "HEX" },
                          { value: "base64" as DataFormat, label: "Base64" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSendFormat(opt.value);
                              setShowFormatDropdown(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                              sendFormat === opt.value ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <input
                  type="text"
                  className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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
                <button
                  onClick={() => handleSendMessage()}
                  disabled={
                    !sendData.trim() ||
                    (selectedSession.status !== "connected" && selectedSession.status !== "listening")
                  }
                  className="flex items-center gap-2 px-5 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  发送
                </button>
                {/* 自动发送按钮 */}
                <button
                  onClick={() => setShowAutoSendPanel(!showAutoSendPanel)}
                  className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                    showAutoSendPanel || autoSendEnabled
                      ? "bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400"
                      : "bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                  title="自动发送配置"
                >
                  {autoSendEnabled ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Timer size={16} />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* 空状态 */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                <Radio size={32} className="text-cyan-500" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 mb-4">选择或创建一个会话开始测试</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
              >
                <Plus size={18} />
                新建会话
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
